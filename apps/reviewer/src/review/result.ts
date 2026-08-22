import { createHash } from 'node:crypto';
import { z } from 'zod';
import { productName } from '../identity.js';

export const reviewResultSchema = z.object({
  coverage: z
    .object({
      changed_files: z.array(z.string()),
      complete: z.boolean(),
      omitted_files: z.array(z.string()),
      reviewed_files: z.array(z.string()),
    })
    .optional(),
  finding_updates: z
    .array(
      z.object({
        evidence: z.string(),
        fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
        status: z.enum(['fixed', 'still_present']),
      }),
    )
    .optional(),
  findings: z.array(
    z.object({
      confidence: z.enum(['high', 'medium', 'low']),
      evidence: z.string(),
      explanation: z.string(),
      file: z.string(),
      line: z.number().int().positive(),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      suggested_action: z.string(),
      title: z.string(),
    }),
  ),
  limitations: z.array(z.string()),
  summary: z.string(),
  tests_run: z.array(
    z.object({
      command: z.string(),
      evidence: z.string(),
      status: z.enum(['passed', 'failed', 'not_run']),
    }),
  ),
});

export type ReviewResult = z.infer<typeof reviewResultSchema>;

export type ReviewConclusion = 'neutral' | 'success';

function normalizedPaths(paths: readonly string[]): Set<string> {
  return new Set(paths.map((path) => path.replace(/^\.\//, '').trim()));
}

export function reviewCoverage(result: ReviewResult):
  | {
      changed: number;
      omitted: number;
      reviewed: number;
      complete: boolean;
    }
  | undefined {
  if (result.coverage === undefined) {
    return undefined;
  }
  const changedFiles = normalizedPaths(result.coverage.changed_files);
  if (changedFiles.size === 0) {
    return undefined;
  }
  const reviewedFiles = normalizedPaths(result.coverage.reviewed_files);
  const omittedFiles = normalizedPaths(result.coverage.omitted_files);
  const reviewed = [...reviewedFiles].filter((file) => changedFiles.has(file)).length;
  const omitted = [...omittedFiles].filter((file) => changedFiles.has(file)).length;
  return {
    changed: changedFiles.size,
    omitted,
    reviewed,
    complete:
      result.coverage.complete &&
      omittedFiles.size === 0 &&
      [...changedFiles].every((file) => reviewedFiles.has(file)),
  };
}

export function reviewConclusion(result: ReviewResult): ReviewConclusion {
  if (
    result.findings.length > 0 ||
    result.finding_updates?.some((update) => update.status === 'still_present') === true ||
    result.coverage === undefined
  ) {
    return 'neutral';
  }
  return reviewCoverage(result)?.complete === true ? 'success' : 'neutral';
}

export function findingFingerprint(finding: ReviewResult['findings'][number]): string {
  const normalizedPath = finding.file.replace(/^\.\//, '').trim().toLowerCase();
  const normalizedTitle = finding.title
    .toLowerCase()
    .replaceAll(/[^a-z0-9가-힣]+/g, ' ')
    .trim();
  return createHash('sha256')
    .update(`${normalizedPath}\0${normalizedTitle}`)
    .digest('hex')
    .slice(0, 16);
}

export function removePreviouslyReportedFindings(
  result: ReviewResult,
  previous: ReviewResult | undefined,
  changedFiles: ReadonlySet<string> = new Set(),
): ReviewResult {
  if (previous === undefined || previous.findings.length === 0) {
    return result;
  }

  const previousLocations = new Set(
    previous.findings.map((finding) => `${finding.file}:${finding.line}`),
  );
  const previousFingerprints = new Set(previous.findings.map(findingFingerprint));
  const findings = result.findings.filter(
    (finding) =>
      !previousFingerprints.has(findingFingerprint(finding)) &&
      (changedFiles.has(finding.file) || !previousLocations.has(`${finding.file}:${finding.line}`)),
  );
  if (findings.length === result.findings.length) {
    return result;
  }

  return {
    ...result,
    findings,
    summary:
      findings.length === 0
        ? 'No new actionable defects were identified in the incremental changes.'
        : result.summary,
  };
}

const checkStatusMarkers: Record<ReviewResult['tests_run'][number]['status'], string> = {
  passed: '🟢',
  failed: '🔴',
  not_run: '⚪',
};

export const findingSeverityMarkers: Record<ReviewResult['findings'][number]['severity'], string> =
  {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🔵',
  };

function renderTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll(/\r?\n/g, '<br>');
}

function renderInlineCode(value: string): string {
  const longestFence = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(longestFence + 1);
  const paddedValue = value.startsWith('`') || value.endsWith('`') ? ` ${value} ` : value;
  return `${fence}${renderTableCell(paddedValue)}${fence}`;
}

export function renderReview(
  result: ReviewResult,
  inlineFindingIndexes: ReadonlySet<number> = new Set(),
): string {
  const sections = [`## ${productName} review`, '', result.summary];

  sections.push('', '### Findings');
  if (result.findings.length === 0) {
    sections.push('', 'No actionable defects found.');
  } else {
    if (inlineFindingIndexes.size > 0) {
      sections.push(
        '',
        `${inlineFindingIndexes.size} ${inlineFindingIndexes.size === 1 ? 'finding was' : 'findings were'} published inline.`,
      );
    }
    for (const [index, finding] of result.findings.entries()) {
      if (inlineFindingIndexes.has(index)) {
        continue;
      }
      sections.push(
        '',
        `#### ${findingSeverityMarkers[finding.severity]} [${finding.severity.toUpperCase()}] ${finding.title}`,
        '',
        `\`${finding.file}:${finding.line}\` · confidence: ${finding.confidence}`,
        '',
        finding.explanation,
        '',
        `**Evidence:** ${finding.evidence}`,
        '',
        `**Suggested action:** ${finding.suggested_action}`,
      );
    }
  }

  sections.push('', '### Checks');
  if (result.tests_run.length === 0) {
    sections.push('', 'No checks were run.');
  } else {
    const counts = result.tests_run.reduce(
      (total, test) => ({ ...total, [test.status]: total[test.status] + 1 }),
      { passed: 0, failed: 0, not_run: 0 },
    );
    const disclosure = counts.failed > 0 || counts.not_run > 0 ? '<details open>' : '<details>';

    sections.push(
      '',
      `**${counts.passed} passed · ${counts.failed} failed · ${counts.not_run} not run**`,
      '',
      disclosure,
      `<summary>Show ${result.tests_run.length} checks</summary>`,
      '',
    );
    sections.push('| Status | Check | Evidence |', '| --- | --- | --- |');
    for (const test of result.tests_run) {
      const status = test.status === 'not_run' ? 'not run' : test.status;
      sections.push(
        `| ${checkStatusMarkers[test.status]} **${status}** | ${renderInlineCode(test.command)} | ${renderTableCell(test.evidence)} |`,
      );
    }
    sections.push('', '</details>');
  }

  if (result.limitations.length > 0) {
    sections.push('', '### Limitations');
    for (const limitation of result.limitations) {
      sections.push('', `- ${limitation}`);
    }
  }

  return sections.join('\n');
}
