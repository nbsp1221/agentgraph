import { describe, expect, it } from 'vitest';
import { runProcess } from '../../../src/system/process.js';

describe('runProcess cancellation', () => {
  it('stops a running child when the external signal is aborted', async () => {
    const controller = new AbortController();
    const startedAt = Date.now();
    const processPromise = runProcess(
      process.execPath,
      ['-e', 'setInterval(() => undefined, 1_000)'],
      {
        signal: controller.signal,
        timeoutMilliseconds: 10_000,
      },
    );

    setTimeout(() => controller.abort(), 50);

    await expect(processPromise).rejects.toMatchObject({ isCanceled: true });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});
