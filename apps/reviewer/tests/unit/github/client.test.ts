import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GitHubAppClient,
  canManageRepositoryRole,
  githubRetryDelayMilliseconds,
  limitGitHubBody,
  repositoryReadTokenRequest,
} from '../../../src/github/client.js';

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

beforeEach(() => {
  vi.clearAllMocks();
  githubMocks.getInstallationOctokit.mockResolvedValue({
    request: githubMocks.installationRequest,
  });
});

describe('GitHub output limits', () => {
  it('keeps short bodies unchanged and marks truncated output', () => {
    expect(limitGitHubBody('short', 10)).toBe('short');

    const truncated = limitGitHubBody('x'.repeat(200), 80);
    expect(truncated).toHaveLength(80);
    expect(truncated).toContain('Review output was truncated');
  });
});

describe('Sandbox repository token scope', () => {
  it('limits the token to one repository with read-only contents access', () => {
    expect(repositoryReadTokenRequest(42, 99)).toEqual({
      installation_id: 42,
      permissions: { contents: 'read' },
      repository_ids: [99],
    });
  });
});

describe('GitHub retry classification', () => {
  it('backs off for transient and rate-limited responses', () => {
    expect(githubRetryDelayMilliseconds({ status: 503 }, 0)).toBe(500);
    expect(
      githubRetryDelayMilliseconds(
        {
          response: { headers: { 'retry-after': '2' } },
          status: 429,
        },
        0,
      ),
    ).toBe(2_000);
    expect(githubRetryDelayMilliseconds({ code: 'ECONNRESET' }, 1)).toBe(1_000);
  });

  it('does not retry authentication or validation failures', () => {
    expect(githubRetryDelayMilliseconds({ status: 401 }, 0)).toBeUndefined();
    expect(githubRetryDelayMilliseconds({ status: 422 }, 0)).toBeUndefined();
  });
});

describe('manual command authorization', () => {
  it('accepts triage-or-higher roles and rejects read-only roles', () => {
    expect(canManageRepositoryRole('triage')).toBe(true);
    expect(canManageRepositoryRole('write')).toBe(true);
    expect(canManageRepositoryRole('admin')).toBe(true);
    expect(canManageRepositoryRole('read')).toBe(false);
    expect(canManageRepositoryRole('none')).toBe(false);
  });
});

describe('manual command reply delivery', () => {
  it('reconciles an ambiguous comment POST and does not post again on redelivery', async () => {
    let postAttempts = 0;
    let commentLookups = 0;
    githubMocks.installationRequest.mockImplementation((route: string) => {
      if (route === 'GET /repos/{owner}/{repo}/issues/{issue_number}/comments') {
        commentLookups += 1;
        return {
          data:
            commentLookups === 1
              ? []
              : [{ body: '<!-- retn0-assistant:command-reply:delivery-1 -->', id: 77 }],
        };
      }
      if (route === 'POST /repos/{owner}/{repo}/issues/{issue_number}/comments') {
        postAttempts += 1;
        throw new Error('connection lost after GitHub accepted the comment');
      }
      throw new Error(`unexpected route: ${route}`);
    });

    const client = new GitHubAppClient({
      appId: 1,
      clientId: 'client',
      name: 'agentgraph',
      privateKey: 'private-key',
      slug: 'agentgraph',
      webhookSecret: 'secret',
    });
    const input = {
      body: 'Review queued.',
      deliveryId: 'delivery-1',
      installationId: 42,
      pullRequestNumber: 7,
      repository: 'example/project',
    };

    await expect(client.createCommandReply(input)).resolves.toBe(77);
    await expect(client.createCommandReply(input)).resolves.toBe(77);

    expect(postAttempts).toBe(1);
    expect(commentLookups).toBe(3);
  });
});
