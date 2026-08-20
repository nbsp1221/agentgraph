import { describe, expect, it } from 'vitest';
import type { ReviewJob } from '../../../src/jobs/database.js';
import type { ReviewResult } from '../../../src/review/result.js';
import {
  renderCompletedComment,
  renderFailedComment,
  renderProgressComment,
  renderSupersededComment,
} from '../../../src/review/status-comment.js';

const job: ReviewJob = {
  action: 'synchronize',
  checkRunId: 123,
  deliveryId: 'delivery-1',
  headSha: 'bbbbbbb2222222222222222222222222222222222',
  id: 7,
  installationId: 42,
  policyVersion: 'v2',
  publishedReviewId: undefined,
  pullRequestNumber: 9,
  repository: 'example/project',
  resultPath: undefined,
  state: 'REVIEWING',
};

const result: ReviewResult = {
  findings: [],
  limitations: [],
  summary: 'No findings',
  tests_run: [
    {
      command: 'pnpm test',
      evidence: 'all tests passed',
      status: 'passed',
    },
  ],
};

describe('review status comments', () => {
  it('renders progress and superseded states with the check link', () => {
    expect(renderProgressComment(job, 123)).toContain('⏳ Reviewing `bbbbbbb`');
    expect(renderSupersededComment(job, 123)).toContain('⚪ Review superseded by a newer commit');
    expect(renderProgressComment(job, 123)).toContain('/runs/123');
  });

  it('describes a successful incremental review without new findings', () => {
    const comment = renderCompletedComment({
      checkRunId: 123,
      durationMilliseconds: 1_500,
      job,
      result,
      reviewBaseSha: 'aaaaaaa1111111111111111111111111111111111',
      reviewId: undefined,
      reviewMode: 'incremental',
    });

    expect(comment).toContain('🟢 Incremental review completed in 2s');
    expect(comment).toContain('0 new findings');
    expect(comment).toContain('Verification: 1 passed');
    expect(comment).toContain('`aaaaaaa..bbbbbbb`');
  });

  it('shows unresolved previous findings as a neutral lifecycle result', () => {
    const comment = renderCompletedComment({
      checkRunId: 123,
      durationMilliseconds: 1_500,
      job,
      result: {
        ...result,
        finding_updates: [
          {
            evidence: 'still reproducible',
            fingerprint: 'a'.repeat(16),
            status: 'still_present',
          },
        ],
      },
      reviewBaseSha: 'aaaaaaa1111111111111111111111111111111111',
      reviewId: undefined,
      reviewMode: 'incremental',
    });

    expect(comment).toContain('🟡 Incremental review completed');
    expect(comment).toContain('1 existing finding remains unresolved');
  });

  it('limits a failed status comment to the first error line', () => {
    const comment = renderFailedComment({
      checkRunId: 123,
      error: 'first line\nsensitive detail',
      job,
      phase: 'SANDBOX_CREATING',
    });

    expect(comment).toContain('Phase: sandbox creating');
    expect(comment).toContain('Error: first line');
    expect(comment).not.toContain('sensitive detail');
  });
});
