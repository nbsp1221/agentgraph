'use client';

import { createContext, use } from 'react';

export type EvaluationTransport = typeof fetch;

const EvaluationTransportContext = createContext<EvaluationTransport>(fetch);

export function useEvaluationTransport() {
  return use(EvaluationTransportContext);
}

export function EvaluationTransportProvider({
  transport,
  children,
}: {
  transport: EvaluationTransport;
  children: React.ReactNode;
}) {
  return <EvaluationTransportContext value={transport}>{children}</EvaluationTransportContext>;
}
