import { describe, expect, it } from 'vitest';
import { JobDatabase } from '../../../src/jobs/database.js';
import { type ReviewResult, findingFingerprint } from '../../../src/review/result.js';

const baseJob = {
  action: 'opened',
  deliveryId: 'delivery-1',
  headSha: 'a'.repeat(40),
  installationId: 42,
  policyVersion: 'v1',
  pullRequestNumber: 7,
  repository: 'example/project',
};

describe('JobDatabase', () => {
  it('deduplicates both webhook deliveries and review job identities', () => {
    const database = new JobDatabase(':memory:');

    expect(database.enqueuePullRequest(baseJob)).toEqual({
      deliveryAccepted: true,
      jobCreated: true,
      jobsSuperseded: 0,
    });
    expect(database.enqueuePullRequest(baseJob)).toEqual({
      deliveryAccepted: false,
      jobCreated: false,
      jobsSuperseded: 0,
    });
    expect(
      database.enqueuePullRequest({
        ...baseJob,
        deliveryId: 'delivery-2',
      }),
    ).toEqual({ deliveryAccepted: true, jobCreated: false, jobsSuperseded: 0 });
    expect(database.countJobs()).toBe(1);

    const job = database.claimNextJob();
    expect(job?.checkRunId).toBeUndefined();
    if (job === undefined) {
      throw new Error('expected a queued job');
    }
    database.updateJob({
      checkRunId: 1234,
      id: job.id,
      state: 'CHECKING_OUT',
    });
    expect(database.activatePullRequestJob(job)).toEqual({
      currentHeadSha: baseJob.headSha,
      currentJobId: job.id,
      statusCommentId: undefined,
    });
    expect(
      database.attachStatusComment({
        commentId: 5678,
        jobId: job.id,
        pullRequestNumber: job.pullRequestNumber,
        repository: job.repository,
      }),
    ).toBe(true);
    expect(
      database.isCurrentPullRequestJob({
        jobId: job.id,
        pullRequestNumber: job.pullRequestNumber,
        repository: job.repository,
      }),
    ).toBe(true);

    database.updateJob({
      id: job.id,
      publishedReviewId: 9012,
      resultPath: '/tmp/previous-review.json',
      state: 'DONE',
    });
    database.enqueuePullRequest({
      ...baseJob,
      deliveryId: 'delivery-3',
      headSha: 'b'.repeat(40),
    });
    const nextJob = database.claimNextJob();
    expect(nextJob).toBeDefined();
    if (nextJob === undefined) {
      throw new Error('expected a second queued job');
    }
    expect(database.findPreviousCompletedReview(nextJob)).toEqual({
      headSha: baseJob.headSha,
      resultPaths: ['/tmp/previous-review.json'],
    });

    database.close();
  });

  it('coalesces queued heads and claims only the latest head for a pull request', () => {
    const database = new JobDatabase(':memory:');
    database.enqueuePullRequest(baseJob);
    expect(
      database.enqueuePullRequest({
        ...baseJob,
        deliveryId: 'delivery-2',
        headSha: 'b'.repeat(40),
      }),
    ).toMatchObject({ jobCreated: true, jobsSuperseded: 1 });
    expect(
      database.enqueuePullRequest({
        ...baseJob,
        deliveryId: 'delivery-3',
        headSha: 'c'.repeat(40),
      }),
    ).toMatchObject({ jobCreated: true, jobsSuperseded: 1 });

    expect(database.claimNextJob()?.headSha).toBe('c'.repeat(40));
    expect(database.claimNextJob()).toBeUndefined();
    expect(database.countJobs()).toBe(3);
    database.close();
  });

  it('cancels queued work once per lifecycle delivery and can revive the same head', () => {
    const database = new JobDatabase(':memory:');
    database.enqueuePullRequest(baseJob);
    const cancellation = {
      action: 'converted_to_draft' as const,
      deliveryId: 'delivery-2',
      headSha: baseJob.headSha,
      installationId: baseJob.installationId,
      pullRequestNumber: baseJob.pullRequestNumber,
      repository: baseJob.repository,
    };

    expect(database.cancelPullRequest(cancellation)).toEqual({
      deliveryAccepted: true,
      jobsCancelled: 1,
    });
    expect(database.cancelPullRequest(cancellation)).toEqual({
      deliveryAccepted: false,
      jobsCancelled: 0,
    });
    expect(database.claimNextJob()).toBeUndefined();

    expect(
      database.enqueuePullRequest({
        ...baseJob,
        action: 'ready_for_review',
        deliveryId: 'delivery-3',
      }),
    ).toMatchObject({ jobCreated: true });
    expect(database.claimNextJob()?.headSha).toBe(baseJob.headSha);
    database.close();
  });

  it('rejects stale cancellation finalization after cancel then revive', () => {
    const database = new JobDatabase(':memory:');
    database.enqueuePullRequest(baseJob);
    const claimed = database.claimNextJob();
    if (claimed === undefined) {
      throw new Error('expected a claimed job');
    }

    expect(
      database.cancelPullRequest({
        action: 'converted_to_draft',
        deliveryId: 'delivery-cancel',
        headSha: baseJob.headSha,
        installationId: baseJob.installationId,
        pullRequestNumber: baseJob.pullRequestNumber,
        repository: baseJob.repository,
      }),
    ).toMatchObject({ jobsCancelled: 1 });
    expect(
      database.enqueuePullRequest({
        ...baseJob,
        action: 'ready_for_review',
        deliveryId: 'delivery-revive',
      }),
    ).toMatchObject({ jobCreated: true });

    expect(
      database.updateJob({
        attempt: claimed.attempt ?? 0,
        id: claimed.id,
        state: 'CANCELLED',
      }),
    ).toBe(false);
    const revived = database.claimNextJob();
    expect(revived).toBeDefined();
    expect(revived?.id).toBe(claimed.id);
    expect(revived?.state).toBe('CHECKING_OUT');
    database.close();
  });

  it('requeues active jobs with a new attempt for graceful shutdown', () => {
    const database = new JobDatabase(':memory:');
    database.enqueuePullRequest(baseJob);
    const claimed = database.claimNextJob();
    if (claimed === undefined) {
      throw new Error('expected a claimed job');
    }

    expect(database.requeueActiveJobs()).toBe(1);
    const retried = database.claimNextJob();
    expect(retried).toMatchObject({ id: claimed.id, state: 'CHECKING_OUT' });
    expect(retried?.attempt).toBeGreaterThan(claimed.attempt ?? 0);
    expect(
      database.updateJob({ attempt: claimed.attempt ?? 0, id: claimed.id, state: 'DONE' }),
    ).toBe(false);
    database.close();
  });

  it('retains a publication identity when a job is retried', () => {
    const database = new JobDatabase(':memory:');
    database.enqueuePullRequest(baseJob);
    const job = database.claimNextJob();
    if (job === undefined) {
      throw new Error('expected a queued job');
    }
    database.updateJob({
      id: job.id,
      publishedReviewId: 99,
      resultPath: '/tmp/result.json',
      state: 'QUEUED',
    });

    expect(database.claimNextJob()).toMatchObject({
      publishedReviewId: 99,
      resultPath: '/tmp/result.json',
    });
    database.close();
  });

  it('tracks explicit finding lifecycle updates without inferring fixed from absence', () => {
    const database = new JobDatabase(':memory:');
    database.enqueuePullRequest(baseJob);
    const job = database.claimNextJob();
    if (job === undefined) {
      throw new Error('expected a queued job');
    }
    const finding: ReviewResult['findings'][number] = {
      confidence: 'high',
      evidence: 'The condition is inverted.',
      explanation: 'A non-owner is allowed.',
      file: 'src/access.ts',
      line: 12,
      severity: 'high',
      suggested_action: 'Invert the condition.',
      title: 'Authorization comparison is inverted',
    };
    const fingerprint = findingFingerprint(finding);
    const emptyResult: ReviewResult = {
      findings: [],
      limitations: [],
      summary: 'No new findings.',
      tests_run: [],
    };

    database.reconcileFindings({
      job,
      previousResult: { ...emptyResult, findings: [finding] },
      result: {
        ...emptyResult,
        finding_updates: [
          { evidence: 'Still inverted at the moved line.', fingerprint, status: 'still_present' },
        ],
      },
    });
    expect(database.getReviewFindings(baseJob.repository, baseJob.pullRequestNumber)).toEqual([
      expect.objectContaining({ fingerprint, state: 'STILL_PRESENT' }),
    ]);

    database.reconcileFindings({
      job,
      previousResult: undefined,
      result: {
        ...emptyResult,
        finding_updates: [
          { evidence: 'The condition is now correct.', fingerprint, status: 'fixed' },
          { evidence: 'unknown', fingerprint: '0'.repeat(16), status: 'fixed' },
        ],
      },
    });
    expect(database.getReviewFindings(baseJob.repository, baseJob.pullRequestNumber)).toEqual([
      expect.objectContaining({
        evidence: 'The condition is now correct.',
        fingerprint,
        state: 'FIXED',
      }),
    ]);

    database.reconcileFindings({ job, previousResult: undefined, result: emptyResult });
    expect(
      database.getReviewFindings(baseJob.repository, baseJob.pullRequestNumber)[0]?.state,
    ).toBe('FIXED');
    database.close();
  });

  it('deduplicates and audits manual commands', () => {
    const database = new JobDatabase(':memory:');
    const command = {
      actor: 'octocat',
      command: 'status' as const,
      commentId: 99,
      deliveryId: 'command-delivery-1',
      installationId: 42,
      pullRequestNumber: 7,
      repository: 'example/project',
    };

    expect(database.acceptManualCommand(command)).toBe(true);
    expect(database.acceptManualCommand(command)).toBe(false);
    database.completeManualCommand(command.deliveryId, 'FAILED', 'temporary error');
    expect(database.acceptManualCommand(command)).toBe(true);
    database.completeManualCommand(command.deliveryId, 'COMPLETED');
    database.close();
  });
});
