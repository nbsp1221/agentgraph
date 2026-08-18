'use client';

import {
  type ContextTransport,
  ContextTransportProvider,
} from '../features/reviews/finding-context';

export function FixtureContextTransport({
  mode,
  children,
}: {
  mode?: 'available' | 'unavailable' | 'loading' | 'error' | undefined;
  children: React.ReactNode;
}) {
  if (!mode) {
    return <>{children}</>;
  }
  const transport: ContextTransport =
    mode === 'loading'
      ? () => new Promise<Response>(() => {})
      : mode === 'error'
        ? () => Promise.resolve(new Response('', { status: 503 }))
        : () =>
            Promise.resolve(
              Response.json(
                mode === 'available'
                  ? {
                      available: true,
                      source: 'github_comparison',
                      file: 'src/review/worker.ts',
                      line: 42,
                      content: 'const boundedFixtureContext = true;\n',
                      start_line: 40,
                      end_line: 44,
                      unavailable_reason: null,
                    }
                  : {
                      available: false,
                      source: 'unavailable',
                      file: 'src/review/worker.ts',
                      line: 42,
                      content: null,
                      start_line: null,
                      end_line: null,
                      unavailable_reason: 'GITHUB_CONTEXT_UNAVAILABLE',
                    },
              ),
            );
  return <ContextTransportProvider transport={transport}>{children}</ContextTransportProvider>;
}
