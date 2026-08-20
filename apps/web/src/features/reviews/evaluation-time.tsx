'use client';

import { useLocale } from 'next-intl';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

export function EvaluationTime({ value }: { value: string }) {
  const locale = useLocale();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const formatted = mounted
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';
  return (
    <time dateTime={value} title={value}>
      {formatted}
    </time>
  );
}
