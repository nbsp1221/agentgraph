import { runProcess } from '../system/process.js';

const reviewSandboxPattern = /^leverframe-job-(\d+)$/;

export function orphanReviewSandboxes(
  sandboxNames: readonly string[],
  activeJobIds: ReadonlySet<number>,
): string[] {
  return sandboxNames.filter((name) => {
    const match = reviewSandboxPattern.exec(name);
    return match !== null && !activeJobIds.has(Number(match[1]));
  });
}

export async function recoverOrphanSandboxes(activeJobIds: ReadonlySet<number>): Promise<string[]> {
  const inventory = await runProcess('sbx', ['list', '--quiet'], {
    timeoutMilliseconds: 60_000,
  });
  const names = inventory.stdout
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const orphans = orphanReviewSandboxes(names, activeJobIds);
  for (const name of orphans) {
    await runProcess('sbx', ['rm', '--force', name], {
      timeoutMilliseconds: 2 * 60 * 1000,
    });
  }
  return orphans;
}
