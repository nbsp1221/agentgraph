import { describe, expect, it } from 'vitest';
import { orphanReviewSandboxes } from '../../../src/sandbox/recovery.js';

describe('orphan sandbox recovery', () => {
  it('targets only inactive sandboxes owned by the review worker', () => {
    expect(
      orphanReviewSandboxes(
        [
          'codex-alphalab',
          'leverframe-job-12',
          'leverframe-job-13',
          'retn0-assistant-job-14',
          'leverframe-job-not-a-number',
          'other-job-14',
        ],
        new Set([13]),
      ),
    ).toEqual(['leverframe-job-12', 'retn0-assistant-job-14']);
  });
});
