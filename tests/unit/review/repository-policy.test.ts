import { describe, expect, it } from 'vitest';
import { parseRepositoryPolicy } from '../../../src/review/repository-policy.js';

describe('repository policy', () => {
  it('parses a minimal immutable review policy', () => {
    const policy = parseRepositoryPolicy(`
version: 1
review:
  instructions:
    - Verify database migrations against existing data.
`);

    expect(policy.review.instructions).toEqual([
      'Verify database migrations against existing data.',
    ]);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.review.instructions)).toBe(true);
  });

  it('rejects credentials, endpoints, mounts, and other unknown authority', () => {
    expect(() =>
      parseRepositoryPolicy(`
version: 1
review:
  instructions: []
model: gpt-5.6-sol
credentials: /host/secrets
`),
    ).toThrow();
  });

  it('returns a fresh object for every job', () => {
    const first = parseRepositoryPolicy('version: 1');
    const second = parseRepositoryPolicy('version: 1');

    expect(first).not.toBe(second);
    expect(first.review).not.toBe(second.review);
  });
});
