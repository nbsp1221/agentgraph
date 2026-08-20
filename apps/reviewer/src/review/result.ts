import { createHash } from 'node:crypto';
import { z } from 'zod';

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

export function reviewConclusion(result: ReviewResult): ReviewConclusion {
  if (
    result.findings.length > 0 ||
    result.finding_updates?.some((update) => update.status === 'still_present') === true ||
    result.coverage === undefined
  ) {
    return 'neutral';
  }
  const reviewed = new Set(result.coverage.reviewed_files);
  const complete =
    result.coverage.complete &&
    result.coverage.omitted_files.length === 0 &&
    result.coverage.changed_files.every((file) => reviewed.has(file));
  return complete ? 'success' : 'neutral';
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

export function renderReview(
  result: ReviewResult,
  inlineFindingIndexes: ReadonlySet<number> = new Set(),
): string {
  const sections = ['## retn0-assistant review', '', result.summary];

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
        `#### [${finding.severity.toUpperCase()}] ${finding.title}`,
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

  sections.push('', '### Verification');
  if (result.tests_run.length === 0) {
    sections.push('', 'No tests were run.');
  } else {
    for (const test of result.tests_run) {
      sections.push('', `- **${test.status}** \`${test.command}\` — ${test.evidence}`);
    }
  }

  if (result.limitations.length > 0) {
    sections.push('', '### Limitations');
    for (const limitation of result.limitations) {
      sections.push('', `- ${limitation}`);
    }
  }

  return sections.join('\n');
}
