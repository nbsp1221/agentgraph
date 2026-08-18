import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../../../src/cli.js';

describe('AgentGraph CLI', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints help when no arguments are provided', () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    expect(run([])).toBe(0);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });

  it('prints the package version', () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    expect(run(['--version'])).toBe(0);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('0.0.0'));
  });

  it('starts the service through the serve command', () => {
    const startServer = vi.fn();

    expect(run(['serve'], startServer)).toBe(0);
    expect(startServer).toHaveBeenCalledOnce();
  });

  it('rejects unknown commands', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(run(['review'])).toBe(1);
    expect(output).toHaveBeenCalledWith('Unknown command: review');
  });

  it('rejects unknown options', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(run(['--unknown'])).toBe(1);
    expect(output).toHaveBeenCalledWith('Unknown option `--unknown`');
  });
});
