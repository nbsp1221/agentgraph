import { reviewerSandboxPatterns } from '../identity.js';
import { runProcess } from '../system/process.js';

export function orphanReviewSandboxes(
  sandboxNames: readonly string[],
  activeJobIds: ReadonlySet<number>,
): string[] {
  const reviewSandboxPatterns = reviewerSandboxPatterns();
  return sandboxNames.filter((name) => {
    const match = reviewSandboxPatterns
      .map((pattern) => pattern.exec(name))
      .find((candidate) => candidate !== null);
    return match !== undefined && match !== null && !activeJobIds.has(Number(match[1]));
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
