import type { ReviewableLines } from './diff-lines.js';
import { type ReviewResult, findingSeverityMarkers } from './result.js';

export interface ReviewInlineComment {
  body: string;
  line: number;
  path: string;
}

export interface PreparedReviewPublication {
  inlineComments: ReviewInlineComment[];
  inlineFindingIndexes: ReadonlySet<number>;
}

export function prepareReviewPublication(
  result: ReviewResult,
  reviewableLines: ReviewableLines,
): PreparedReviewPublication {
  const inlineComments: ReviewInlineComment[] = [];
  const inlineFindingIndexes = new Set<number>();

  for (const [index, finding] of result.findings.entries()) {
    const path = finding.file.replace(/^\.\//, '');
    if (!reviewableLines.get(path)?.has(finding.line)) {
      continue;
    }
    inlineFindingIndexes.add(index);
    inlineComments.push({
      body: renderInlineFinding(finding),
      line: finding.line,
      path,
    });
  }

  return { inlineComments, inlineFindingIndexes };
}

function renderInlineFinding(finding: ReviewResult['findings'][number]): string {
  return [
    `${findingSeverityMarkers[finding.severity]} **[${finding.severity.toUpperCase()}] ${finding.title}**`,
    '',
    finding.explanation,
    '',
    `**Evidence:** ${finding.evidence}`,
    '',
    `**Suggested action:** ${finding.suggested_action}`,
    '',
    `_Confidence: ${finding.confidence}_`,
  ].join('\n');
}
