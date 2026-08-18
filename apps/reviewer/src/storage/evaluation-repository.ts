import type { DatabaseSync } from 'node:sqlite';
import { type ReviewResult, findingFingerprint } from '../review/result.js';
import { transaction } from './connection.js';

export type EvaluationTarget = 'review' | 'finding';
export type ReviewVerdict = 'useful' | 'mixed' | 'not_useful' | 'unable_to_assess';
export type FindingVerdict = 'valid' | 'partially_valid' | 'false_positive' | 'unable_to_verify';

export interface EvaluationRevision {
  id: number;
  jobId: number;
  targetType: EvaluationTarget;
  findingFingerprint?: string;
  verdict?: ReviewVerdict | FindingVerdict;
  rationale?: string;
  source: 'manual';
  action: 'set' | 'withdraw';
  supersedesId?: number;
  createdAt: string;
}

export class EvaluationConflictError extends Error {
  readonly current: EvaluationRevision | undefined;
  constructor(current: EvaluationRevision | undefined) {
    super('evaluation revision is stale');
    this.name = 'EvaluationConflictError';
    this.current = current;
  }
}

const REVIEW_VERDICTS = new Set<ReviewVerdict>([
  'useful',
  'mixed',
  'not_useful',
  'unable_to_assess',
]);
const FINDING_VERDICTS = new Set<FindingVerdict>([
  'valid',
  'partially_valid',
  'false_positive',
  'unable_to_verify',
]);

export class EvaluationRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly artifactReader: (
      jobId: number,
    ) => { available: boolean; result?: ReviewResult } | undefined,
  ) {}

  setEvaluation(input: {
    jobId: number;
    targetType: EvaluationTarget;
    findingFingerprint?: string;
    verdict: ReviewVerdict | FindingVerdict;
    rationale?: string;
    expectedPreviousId: number | null;
  }): EvaluationRevision {
    return this.write({ ...input, action: 'set' });
  }
  withdrawEvaluation(input: {
    jobId: number;
    targetType: EvaluationTarget;
    findingFingerprint?: string;
    expectedPreviousId: number | null;
  }): EvaluationRevision {
    return this.write({ ...input, action: 'withdraw' });
  }
  getEvaluationHistory(
    jobId: number,
    targetType: EvaluationTarget,
    findingFingerprint?: string,
  ): EvaluationRevision[] {
    const rows = this.database
      .prepare(
        'SELECT * FROM evaluation_revisions WHERE job_id=? AND target_type=? AND (finding_fingerprint IS ? OR finding_fingerprint=?) ORDER BY id',
      )
      .all(jobId, targetType, findingFingerprint ?? null, findingFingerprint ?? null) as Array<
      Record<string, unknown>
    >;
    return rows.map(mapRevision);
  }
  getCurrentEvaluation(
    jobId: number,
    targetType: EvaluationTarget,
    findingFingerprint?: string,
  ): EvaluationRevision | undefined {
    const latest = this.getEvaluationHistory(jobId, targetType, findingFingerprint).at(-1);
    return latest?.action === 'withdraw' ? undefined : latest;
  }

  private write(input: {
    jobId: number;
    targetType: EvaluationTarget;
    findingFingerprint?: string;
    verdict?: ReviewVerdict | FindingVerdict;
    rationale?: string;
    expectedPreviousId: number | null;
    action: 'set' | 'withdraw';
  }): EvaluationRevision {
    if (input.expectedPreviousId === undefined) {
      throw new Error('expectedPreviousId must be explicitly null or a revision id');
    }
    return transaction(this.database, () => {
      const job = this.database
        .prepare('SELECT state FROM review_jobs WHERE id=?')
        .get(input.jobId) as { state: string } | undefined;
      if (job?.state !== 'DONE') {
        throw new Error('evaluation requires a completed review job');
      }
      const artifact = this.artifactReader(input.jobId);
      if (artifact?.available !== true || artifact.result === undefined) {
        throw new Error('evaluation requires an available review artifact');
      }
      if (input.targetType === 'finding') {
        if (
          input.action === 'set' &&
          (typeof input.verdict !== 'string' ||
            !FINDING_VERDICTS.has(input.verdict as FindingVerdict))
        ) {
          throw new Error('invalid finding evaluation verdict');
        }
        if (
          input.findingFingerprint === undefined ||
          !artifact.result.findings.some(
            (finding) => findingFingerprint(finding) === input.findingFingerprint,
          )
        ) {
          throw new Error('finding evaluation target does not exist');
        }
      } else {
        if (input.findingFingerprint !== undefined) {
          throw new Error('review evaluation cannot have a finding fingerprint');
        }
        if (
          input.action === 'set' &&
          (typeof input.verdict !== 'string' ||
            !REVIEW_VERDICTS.has(input.verdict as ReviewVerdict))
        ) {
          throw new Error('invalid review evaluation verdict');
        }
      }
      const current = this.getEvaluationHistory(
        input.jobId,
        input.targetType,
        input.findingFingerprint,
      ).at(-1);
      if (input.action === 'withdraw' && current?.action !== 'set') {
        throw new Error('cannot withdraw without a current evaluation');
      }
      if (
        (input.expectedPreviousId === null && current !== undefined) ||
        (input.expectedPreviousId !== null && input.expectedPreviousId !== current?.id)
      ) {
        throw new EvaluationConflictError(current);
      }
      const now = new Date().toISOString();
      const result = this.database
        .prepare(
          `INSERT INTO evaluation_revisions(job_id,target_type,finding_fingerprint,verdict,rationale,source,action,supersedes_id,created_at) VALUES (?,?,?,?,?,'manual',?,?,?)`,
        )
        .run(
          input.jobId,
          input.targetType,
          input.findingFingerprint ?? null,
          input.action === 'set' ? (input.verdict ?? null) : null,
          input.action === 'set' ? (input.rationale ?? null) : null,
          input.action,
          current?.id ?? null,
          now,
        );
      return mapRevision(
        this.database
          .prepare('SELECT * FROM evaluation_revisions WHERE id=?')
          .get(Number(result.lastInsertRowid)) as Record<string, unknown>,
      );
    });
  }
}

function mapRevision(row: Record<string, unknown>): EvaluationRevision {
  return {
    action: String(row.action) as EvaluationRevision['action'],
    createdAt: String(row.created_at),
    ...(typeof row.finding_fingerprint === 'string'
      ? { findingFingerprint: row.finding_fingerprint }
      : {}),
    id: Number(row.id),
    jobId: Number(row.job_id),
    ...(typeof row.rationale === 'string' ? { rationale: row.rationale } : {}),
    source: 'manual',
    ...(row.supersedes_id === null || row.supersedes_id === undefined
      ? {}
      : { supersedesId: Number(row.supersedes_id) }),
    targetType: String(row.target_type) as EvaluationTarget,
    ...(typeof row.verdict === 'string'
      ? { verdict: row.verdict as ReviewVerdict | FindingVerdict }
      : {}),
  };
}
