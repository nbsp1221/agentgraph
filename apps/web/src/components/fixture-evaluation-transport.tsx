'use client';

import {
  type EvaluationTransport,
  EvaluationTransportProvider,
} from '../features/reviews/evaluation-transport';

export function FixtureEvaluationTransport({
  mode,
  children,
}: {
  mode?: 'saving' | 'failure' | undefined;
  children: React.ReactNode;
}) {
  if (!mode) {
    return <>{children}</>;
  }
  const transport: EvaluationTransport =
    mode === 'saving'
      ? () => new Promise<Response>(() => {})
      : () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: 'fixture evaluation failure' }), {
              status: 503,
              headers: { 'content-type': 'application/json' },
            }),
          );
  return (
    <EvaluationTransportProvider transport={transport}>{children}</EvaluationTransportProvider>
  );
}
