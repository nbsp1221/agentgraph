import { describe, expect, it } from 'vitest';
import { normalizeManualCommand, parseManualCommand } from '../../../src/jobs/command.js';

function payload(overrides: { body?: string; pullRequest?: boolean; userType?: string } = {}) {
  return Buffer.from(
    JSON.stringify({
      action: 'created',
      comment: {
        body: overrides.body ?? '/retn0 review',
        id: 99,
        user: { login: 'octocat', type: overrides.userType ?? 'User' },
      },
      installation: { id: 42 },
      issue: {
        number: 7,
        ...(overrides.pullRequest === false ? {} : { pull_request: { url: 'example' } }),
      },
      repository: { full_name: 'example/project' },
    }),
  );
}

describe('manual review commands', () => {
  it('accepts only the fixed grammar at the start of a comment', () => {
    expect(parseManualCommand('/retn0 review')).toBe('review');
    expect(parseManualCommand('/retn0 review full\nplease run it')).toBe('review_full');
    expect(parseManualCommand('please /retn0 review')).toBeUndefined();
    expect(parseManualCommand('/retn0 review --model expensive')).toBeUndefined();
  });

  it('normalizes human pull request comments and ignores bots and issues', () => {
    expect(normalizeManualCommand({ body: payload(), deliveryId: 'delivery-1' })).toMatchObject({
      actor: 'octocat',
      command: 'review',
      pullRequestNumber: 7,
    });
    expect(
      normalizeManualCommand({
        body: payload({ userType: 'Bot' }),
        deliveryId: 'delivery-2',
      }),
    ).toBeUndefined();
    expect(
      normalizeManualCommand({
        body: payload({ pullRequest: false }),
        deliveryId: 'delivery-3',
      }),
    ).toBeUndefined();
  });
});
