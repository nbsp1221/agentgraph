import { describe, expect, it } from 'vitest';
import {
  type ReviewResult,
  findingFingerprint,
  removePreviouslyReportedFindings,
  renderReview,
  reviewConclusion,
} from '../../../src/review/result.js';

const previousFinding: ReviewResult['findings'][number] = {
  confidence: 'high',
  evidence: 'previous evidence',
  explanation: 'previous explanation',
  file: 'src/access.mjs',
  line: 2,
  severity: 'high',
  suggested_action: 'previous action',
  title: 'Authorization comparison is inverted',
};

const previous: ReviewResult = {
  findings: [previousFinding],
  limitations: [],
  summary: 'Previous review',
  tests_run: [],
};

describe('incremental review findings', () => {
  it('removes a reworded finding at a previously reported location', () => {
    const result = removePreviouslyReportedFindings(
      {
        ...previous,
        findings: [
          {
            ...previousFinding,
            title: 'Non-owners can read profiles',
          },
        ],
        summary: 'Repeated finding',
      },
      previous,
    );

    expect(result.findings).toEqual([]);
    expect(result.summary).toBe(
      'No new actionable defects were identified in the incremental changes.',
    );
  });

  it('preserves a finding at a new location', () => {
    const result = removePreviouslyReportedFindings(
      {
        ...previous,
        findings: [
          {
            ...previousFinding,
            file: 'src/server.mjs',
            line: 20,
          },
        ],
      },
      previous,
    );

    expect(result.findings).toHaveLength(1);
  });

  it('keeps a moved instance of the same semantic finding out of new findings', () => {
    const result = removePreviouslyReportedFindings(
      {
        ...previous,
        findings: [{ ...previousFinding, line: 20 }],
      },
      previous,
      new Set(['src/access.mjs']),
    );

    expect(result.findings).toHaveLength(0);
    expect(findingFingerprint(previousFinding)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('keeps inline findings out of the duplicated summary list', () => {
    const body = renderReview(previous, new Set([0]));

    expect(body).toContain('1 finding was published inline');
    expect(body).not.toContain('#### [HIGH] Authorization comparison is inverted');
    expect(body).not.toContain('gpt-5.6-luna');
  });

  it('reports success only for an explicitly complete zero-finding review', () => {
    const noFindings = { ...previous, findings: [] };

    expect(reviewConclusion(noFindings)).toBe('neutral');
    expect(
      reviewConclusion({
        ...noFindings,
        coverage: {
          changed_files: ['src/access.mjs'],
          complete: false,
          omitted_files: ['src/access.mjs'],
          reviewed_files: [],
        },
      }),
    ).toBe('neutral');
    expect(
      reviewConclusion({
        ...noFindings,
        coverage: {
          changed_files: ['src/access.mjs'],
          complete: true,
          omitted_files: [],
          reviewed_files: ['src/access.mjs'],
        },
      }),
    ).toBe('success');
    expect(
      reviewConclusion({
        ...noFindings,
        coverage: {
          changed_files: ['src/access.mjs'],
          complete: true,
          omitted_files: [],
          reviewed_files: ['src/access.mjs'],
        },
        finding_updates: [
          {
            evidence: 'The inverted comparison remains.',
            fingerprint: 'a'.repeat(16),
            status: 'still_present',
          },
        ],
      }),
    ).toBe('neutral');
  });
});
