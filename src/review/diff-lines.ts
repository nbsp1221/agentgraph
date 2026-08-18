import { runProcess } from '../system/process.js';

export type ReviewableLines = ReadonlyMap<string, ReadonlySet<number>>;

export async function loadReviewableLines(input: {
  baseSha: string;
  headSha: string;
  signal: AbortSignal;
  workspace: string;
}): Promise<ReviewableLines> {
  const diff = await runProcess(
    'git',
    [
      '-c',
      'core.quotePath=false',
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--unified=0',
      `${input.baseSha}...${input.headSha}`,
      '--',
    ],
    { cwd: input.workspace, signal: input.signal },
  );
  return parseReviewableLines(diff.stdout);
}

export function parseReviewableLines(diff: string): ReviewableLines {
  const linesByFile = new Map<string, Set<number>>();
  let currentFile: string | undefined;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4);
      currentFile = path === '/dev/null' ? undefined : path.replace(/^b\//, '');
      if (currentFile !== undefined && !linesByFile.has(currentFile)) {
        linesByFile.set(currentFile, new Set());
      }
      continue;
    }

    if (currentFile === undefined || !line.startsWith('@@ ')) {
      continue;
    }
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (match === null) {
      continue;
    }
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    const reviewableLines = linesByFile.get(currentFile);
    if (reviewableLines === undefined) {
      continue;
    }
    for (let offset = 0; offset < count; offset += 1) {
      reviewableLines.add(start + offset);
    }
  }

  return linesByFile;
}
