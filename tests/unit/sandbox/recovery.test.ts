import { describe, expect, it } from 'vitest';
import { orphanReviewSandboxes } from '../../../src/sandbox/recovery.js';

describe('orphan sandbox recovery', () => {
  it('targets only inactive sandboxes owned by the review worker', () => {
    expect(
      orphanReviewSandboxes(
        [
          'codex-alphalab',
          'retn0-assistant-job-12',
          'retn0-assistant-job-13',
          'retn0-assistant-job-not-a-number',
          'other-job-14',
        ],
        new Set([13]),
      ),
    ).toEqual(['retn0-assistant-job-12']);
  });
});
