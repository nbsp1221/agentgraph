import { describe, expect, it } from 'vitest';
import { isTimeoutError } from '../../../src/jobs/worker.js';

describe('worker failure classification', () => {
  it('recognizes process timeouts without classifying ordinary failures as timeouts', () => {
    expect(isTimeoutError({ timedOut: true })).toBe(true);
    expect(isTimeoutError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isTimeoutError(new Error('ordinary failure'))).toBe(false);
  });
});
