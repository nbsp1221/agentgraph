import { execa } from 'execa';

export interface ProcessResult {
  stderr: string;
  stdout: string;
}

export async function runProcess(
  command: string,
  arguments_: readonly string[],
  options: {
    cwd?: string;
    environment?: NodeJS.ProcessEnv;
    input?: string;
    signal?: AbortSignal;
    timeoutMilliseconds?: number;
  } = {},
): Promise<ProcessResult> {
  const result = await execa(command, arguments_, {
    ...(options.signal === undefined ? {} : { cancelSignal: options.signal }),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.environment === undefined ? {} : { env: options.environment }),
    ...(options.input === undefined ? {} : { input: options.input }),
    encoding: 'utf8',
    extendEnv: options.environment === undefined,
    timeout: options.timeoutMilliseconds ?? 10 * 60 * 1000,
  });
  return { stderr: result.stderr, stdout: result.stdout };
}
