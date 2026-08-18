import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

describe('AgentGraph CLI', () => {
  it('runs through the executable entry point', async () => {
    const result = await execa(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--version']);

    expect(result.stdout).toContain('agentgraph/0.0.0');
  });

  it('returns a useful error for an invalid command', async () => {
    const result = await execa(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'review'], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('Unknown command: review');
  });
});
