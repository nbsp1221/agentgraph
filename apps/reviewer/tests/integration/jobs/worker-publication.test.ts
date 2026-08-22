import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CredentialStore, GitHubAppCredentials } from '../../../src/github/credentials.js';
import type { SandboxReviewer } from '../../../src/sandbox/reviewer.js';
import { JobDatabase } from '../../../src/jobs/database.js';
import { ReviewWorker } from '../../../src/jobs/worker.js';

const githubMocks = vi.hoisted(() => ({
  appRequest: vi.fn(),
  getInstallationOctokit: vi.fn(),
  installationRequest: vi.fn(),
}));

vi.mock('@octokit/app', () => ({
  App: vi.fn(function () {
    return {
      getInstallationOctokit: githubMocks.getInstallationOctokit,
      octokit: { request: githubMocks.appRequest },
    };
  }),
}));

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.clearAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('ReviewWorker publication cancellation', () => {
  it('does not publish or reach DONE when cancellation occurs after verification', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'leverframe-worker-publication-'));
    temporaryDirectories.push(directory);
    const headSha = 'a'.repeat(40);
    const baseSha = 'b'.repeat(40);
    const pullRequest = {
      data: {
        base: {
          ref: 'main',
          repo: {
            clone_url: 'https://github.com/example/project.git',
            default_branch: 'main',
            id: 99,
          },
          sha: baseSha,
        },
        draft: false,
        head: { sha: headSha },
        state: 'open',
        title: 'Test pull request',
      },
    };
    let worker: ReviewWorker | undefined;
    let pullRequestReads = 0;
    let reviewListSeen = false;
    let reviewPostRequests = 0;
    githubMocks.getInstallationOctokit.mockResolvedValue({
      request: githubMocks.installationRequest,
    });
    githubMocks.appRequest.mockImplementation((route: string) => {
      if (route === 'GET /app/installations/{installation_id}') {
        return { data: { account: { id: 1 } } };
      }
      if (route === 'POST /app/installations/{installation_id}/access_tokens') {
        return { data: { token: 'read-token' } };
      }
      throw new Error(`unexpected app route: ${route}`);
    });
    githubMocks.installationRequest.mockImplementation((route: string) => {
      if (route === 'GET /repos/{owner}/{repo}/commits/{ref}/check-runs') {
        return { data: { check_runs: [] } };
      }
      if (route === 'POST /repos/{owner}/{repo}/check-runs') {
        return { data: { id: 101 } };
      }
      if (route === 'PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}') {
        return { data: {} };
      }
      if (route === 'GET /repos/{owner}/{repo}/pulls/{pull_number}') {
        pullRequestReads += 1;
        return pullRequest;
      }
      if (route === 'GET /repos/{owner}/{repo}/contents/{path}') {
        throw Object.assign(new Error('missing policy'), { status: 404 });
      }
      if (route === 'GET /repos/{owner}/{repo}/issues/{issue_number}/comments') {
        return { data: [] };
      }
      if (route === 'POST /repos/{owner}/{repo}/issues/{issue_number}/comments') {
        return { data: { id: 202 } };
      }
      if (route === 'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}') {
        return { data: {} };
      }
      if (route === 'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews') {
        reviewListSeen = true;
        worker?.cancelManual({
          actor: 'octocat',
          command: 'review',
          commentId: 99,
          deliveryId: 'delivery-1',
          installationId: 42,
          pullRequestNumber: 7,
          repository: 'example/project',
        });
        return { data: [] };
      }
      if (route === 'POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews') {
        reviewPostRequests += 1;
        return { data: { id: 999 } };
      }
      throw new Error(`unexpected installation route: ${route}`);
    });

    const database = new JobDatabase(':memory:');
    const jobInput = {
      action: 'opened',
      deliveryId: 'delivery-1',
      headSha,
      installationId: 42,
      policyVersion: 'v1',
      pullRequestNumber: 7,
      repository: 'example/project',
    };
    database.enqueuePullRequest(jobInput);

    const reviewer = {
      review: (input: { signal: AbortSignal }) => {
        void input;
        return {
          path: join(directory, 'review-result.json'),
          result: { findings: [], limitations: [], summary: 'No defects', tests_run: [] },
          reviewMode: 'full' as const,
          reviewableLines: new Map(),
        };
      },
    } as unknown as SandboxReviewer;
    const credentials = {
      exists: () => true,
      read: (): GitHubAppCredentials => ({
        appId: 1,
        clientId: 'client',
        name: 'leverframe',
        privateKey: 'private-key',
        slug: 'leverframe',
        webhookSecret: 'secret',
      }),
    } as unknown as CredentialStore;
    worker = new ReviewWorker({
      allowedOwnerId: 1,
      credentials,
      database,
      jobsDirectory: join(directory, 'jobs'),
      reviewer,
    });

    worker.start();
    for (let attempt = 0; attempt < 100 && !reviewListSeen; attempt += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    }
    await worker.stop();

    expect(pullRequestReads).toBeGreaterThanOrEqual(3);
    expect(reviewListSeen).toBe(true);
    expect(reviewPostRequests).toBe(0);
    expect(database.getLatestJobStatus('example/project', 7)?.state).not.toBe('DONE');
    database.close();
  });
});
