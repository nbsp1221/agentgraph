import type { Context, Hono } from 'hono';
import {
  contextResponseSchema,
  deleteEvaluationRequestSchema,
  evaluationWriteRequestSchema,
  evaluationWriteResponseSchema,
  evaluationsResponseSchema,
  findingVerdictSchema,
  reviewListResponseSchema,
  reviewVerdictSchema,
  statusResponseSchema,
} from '@agentgraph/contracts';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { JobDatabase } from '../../jobs/database.js';
import { findingFingerprint } from '../../review/result.js';
import {
  type Dependency,
  type Observation,
  type ServerHooks,
  apiError,
  detailResponse,
  evaluationError,
  evaluationHistory,
  json,
  mapEvaluation,
  mapStatus,
  pageSize,
  positiveId,
} from '../server-common.js';

export function registerReviewRoutes(
  app: Hono,
  database: JobDatabase,
  hooks: ServerHooks,
  observations: Record<Dependency, Observation>,
  recordRead: () => void,
): void {
  app.get('/api/v1/status', (c) => {
    recordRead();
    const values = Object.values(observations).map((item) => item.status);
    const overall = values.includes('unavailable')
      ? 'unavailable'
      : values.includes('degraded')
        ? 'degraded'
        : values.includes('unknown')
          ? 'unknown'
          : 'healthy';
    const response = statusResponseSchema.parse({
      overall,
      observed_at: new Date().toISOString(),
      ...observations,
      active_jobs: database.getActiveJobIds().size,
    });
    return json(c, response);
  });

  const querySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    query: z.string().trim().optional(),
    evaluation: z.enum(['evaluated', 'needs_evaluation']).optional(),
    status: z.string().optional(),
  });
  app.get(
    '/api/v1/reviews',
    zValidator('query', querySchema, (result, c) => {
      if (!result.success) {
        return apiError(c, 422, 'invalid query', 'INVALID_QUERY', result.error.issues);
      }
    }),
    (c) => {
      const query = c.req.valid('query');
      const statusValues =
        c.req.queries('status') ?? (query.status === undefined ? [] : [query.status]);
      const statuses = statusValues
        .flatMap((entry) => entry.split(','))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const statusMap: Record<string, string[]> = {
        running: ['CHECKING_OUT', 'SANDBOX_CREATING', 'REVIEWING', 'VALIDATING', 'PUBLISHING'],
        completed: ['DONE'],
        failed: ['FAILED', 'TIMED_OUT'],
        superseded: ['SUPERSEDED'],
        queued: ['QUEUED'],
        cancelled: ['CANCELLED'],
      };
      if (statuses.some((value) => statusMap[value] === undefined)) {
        return apiError(c, 422, 'invalid status filter', 'INVALID_QUERY');
      }
      const result = database.listReviewJobs({
        page: query.page,
        ...(query.query === undefined ? {} : { query: query.query }),
        ...(statuses.length === 0
          ? {}
          : { statuses: statuses.flatMap((value) => statusMap[value] ?? []) }),
        ...(query.evaluation === undefined ? {} : { evaluation: query.evaluation }),
      });
      const response = reviewListResponseSchema.parse({
        page: query.page,
        page_size: pageSize,
        total_items: result.totalItems,
        total_pages: Math.ceil(result.totalItems / pageSize),
        items: result.items.map((item) => ({
          id: item.id,
          repository: item.repository,
          pull_request_number: item.pullRequestNumber,
          pull_request_title: item.pullRequestTitle ?? null,
          head_sha: item.headSha,
          base_sha: item.baseSha ?? null,
          status: mapStatus(item.state),
          model: item.model ?? null,
          reasoning: item.reasoning ?? null,
          findings_count: item.findingsCount,
          highest_severity: item.highestSeverity ?? null,
          review_evaluation: item.reviewVerdict ?? null,
          evaluated_findings: item.evaluatedFindings,
          total_findings: item.totalFindings,
          created_at: item.createdAt,
          completed_at: item.completedAt ?? null,
          duration_ms: item.durationMs ?? null,
        })),
      });
      recordRead();
      return json(c, response);
    },
  );

  app.get('/api/v1/reviews/:reviewId', (c) =>
    detailResponse(c, database, Number(c.req.param('reviewId'))),
  );
  app.get('/api/v1/reviews/:reviewId/evaluations', (c) => {
    const id = positiveId(c.req.param('reviewId'));
    if (id === undefined) {
      return apiError(c, 422, 'invalid review id', 'INVALID_ID');
    }
    const job = database.getReviewJob(id);
    if (job === undefined) {
      return apiError(c, 404, 'review not found', 'NOT_FOUND');
    }
    const findings = database.getReviewArtifact(id)?.result?.findings ?? [];
    const result = evaluationsResponseSchema.parse({
      review: evaluationHistory(database, id, 'review'),
      findings: Object.fromEntries(
        findings.map((finding) => {
          const fingerprint = findingFingerprint(finding);
          return [fingerprint, evaluationHistory(database, id, 'finding', fingerprint)];
        }),
      ),
    });
    recordRead();
    return json(c, result);
  });

  const writeEvaluation = async (
    c: Context,
    targetType: 'review' | 'finding',
    fingerprint?: string,
  ): Promise<Response> => {
    const id = positiveId(c.req.param('reviewId'));
    if (id === undefined) {
      return apiError(c, 422, 'invalid review id', 'INVALID_ID');
    }
    if (database.getReviewJob(id) === undefined) {
      return apiError(c, 404, 'review not found', 'NOT_FOUND');
    }
    if (
      targetType === 'finding' &&
      (fingerprint === undefined || !/^[0-9a-f]{16}$/.test(fingerprint))
    ) {
      return apiError(c, 422, 'invalid finding fingerprint', 'INVALID_TARGET');
    }
    let requestBody: unknown;
    try {
      requestBody = await c.req.json();
    } catch {
      return apiError(c, 422, 'invalid evaluation request', 'INVALID_REQUEST');
    }
    const parsed = evaluationWriteRequestSchema.safeParse(requestBody);
    if (!parsed.success) {
      return apiError(
        c,
        422,
        'invalid evaluation request',
        'INVALID_REQUEST',
        parsed.error.flatten(),
      );
    }
    if (targetType === 'review' && !reviewVerdictSchema.safeParse(parsed.data.verdict).success) {
      return apiError(c, 422, 'invalid review verdict', 'INVALID_VERDICT');
    }
    if (targetType === 'finding' && !findingVerdictSchema.safeParse(parsed.data.verdict).success) {
      return apiError(c, 422, 'invalid finding verdict', 'INVALID_VERDICT');
    }
    try {
      const revision = database.setEvaluation({
        jobId: id,
        targetType,
        ...(fingerprint === undefined ? {} : { findingFingerprint: fingerprint }),
        verdict: parsed.data.verdict,
        ...(parsed.data.rationale === undefined ? {} : { rationale: parsed.data.rationale }),
        expectedPreviousId: parsed.data.expected_previous_id,
      });
      return json(
        c,
        evaluationWriteResponseSchema.parse({
          revision: mapEvaluation(revision),
          current: mapEvaluation(database.getCurrentEvaluation(id, targetType, fingerprint)),
        }),
      );
    } catch (error) {
      return evaluationError(c, error);
    }
  };

  app.put('/api/v1/reviews/:reviewId/evaluation', (c) => writeEvaluation(c, 'review'));
  app.put('/api/v1/reviews/:reviewId/findings/:fingerprint/evaluation', (c) =>
    writeEvaluation(c, 'finding', c.req.param('fingerprint')),
  );

  const withdraw =
    (targetType: 'review' | 'finding', fingerprint?: string) => async (c: Context) => {
      const id = positiveId(c.req.param('reviewId'));
      if (id === undefined) {
        return apiError(c, 422, 'invalid review id', 'INVALID_ID');
      }
      if (database.getReviewJob(id) === undefined) {
        return apiError(c, 404, 'review not found', 'NOT_FOUND');
      }
      let requestBody: unknown;
      try {
        const text = await c.req.text();
        requestBody = text.trim() === '' ? { expected_previous_id: null } : JSON.parse(text);
      } catch {
        return apiError(c, 422, 'invalid expected_previous_id', 'INVALID_REQUEST');
      }
      const parsed = deleteEvaluationRequestSchema.safeParse(requestBody);
      if (!parsed.success) {
        return apiError(c, 422, 'invalid expected_previous_id', 'INVALID_REQUEST');
      }
      try {
        const revision = database.withdrawEvaluation({
          jobId: id,
          targetType,
          ...(fingerprint === undefined ? {} : { findingFingerprint: fingerprint }),
          expectedPreviousId: parsed.data.expected_previous_id,
        });
        return json(
          c,
          evaluationWriteResponseSchema.parse({ revision: mapEvaluation(revision), current: null }),
        );
      } catch (error) {
        return evaluationError(c, error);
      }
    };

  app.delete('/api/v1/reviews/:reviewId/evaluation', withdraw('review'));
  app.delete('/api/v1/reviews/:reviewId/findings/:fingerprint/evaluation', (c) =>
    withdraw('finding', c.req.param('fingerprint'))(c),
  );

  app.get('/api/v1/reviews/:reviewId/findings/:fingerprint/context', async (c) => {
    const id = positiveId(c.req.param('reviewId'));
    const fingerprint = c.req.param('fingerprint');
    if (id === undefined || !/^[0-9a-f]{16}$/.test(fingerprint)) {
      return apiError(c, 422, 'invalid context target', 'INVALID_TARGET');
    }
    const job = database.getReviewJob(id);
    if (job === undefined) {
      return apiError(c, 404, 'review not found', 'NOT_FOUND');
    }
    const finding = database
      .getReviewArtifact(id)
      ?.result?.findings.find((item) => findingFingerprint(item) === fingerprint);
    if (finding === undefined) {
      return apiError(c, 404, 'finding not found', 'NOT_FOUND');
    }
    if (finding.evidence.trim() !== '') {
      return json(
        c,
        contextResponseSchema.parse({
          available: true,
          source: 'stored_evidence',
          file: finding.file,
          line: finding.line,
          content: finding.evidence.slice(0, 16_384),
          start_line: finding.line,
          end_line: finding.line,
          unavailable_reason: null,
        }),
      );
    }
    if (hooks.getFindingContext !== undefined && job.baseSha !== undefined) {
      try {
        const context = await hooks.getFindingContext({
          repository: job.repository,
          installationId: job.installationId,
          baseSha: job.baseSha,
          headSha: job.headSha,
          file: finding.file,
          line: finding.line,
        });
        if (context !== undefined) {
          return json(
            c,
            contextResponseSchema.parse({
              available: true,
              source: 'github_comparison',
              file: finding.file,
              line: finding.line,
              content: context.content.slice(0, 16_384),
              start_line: context.startLine,
              end_line: context.endLine,
              unavailable_reason: null,
            }),
          );
        }
      } catch {
        /* context is best effort and must not hide the finding */
      }
    }
    return json(
      c,
      contextResponseSchema.parse({
        available: false,
        source: 'unavailable',
        file: finding.file,
        line: finding.line,
        content: null,
        start_line: null,
        end_line: null,
        unavailable_reason: 'GITHUB_CONTEXT_UNAVAILABLE',
      }),
    );
  });
}
