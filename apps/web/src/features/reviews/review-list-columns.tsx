'use client';

import type { ReviewListItem } from '@agentgraph/contracts';
import type { tableFeatures } from '@tanstack/react-table';
import { Badge } from '@agentgraph/ui/components/badge';
import { Button } from '@agentgraph/ui/components/button';
import { createColumnHelper } from '@tanstack/react-table';
import { ExternalLinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '../../i18n/navigation';

type Translation = (key: string, values?: Record<string, number>) => string;

type TableFeatures = ReturnType<typeof tableFeatures>;

const columnHelper = createColumnHelper<TableFeatures, ReviewListItem>();

export function createReviewColumns(
  t: Translation,
  common: Translation,
  detailScenario?: string,
  returnQuery?: string,
) {
  return [
    columnHelper.display({
      id: 'repository',
      header: () => t('repository'),
      // oxlint-disable-next-line react/no-unstable-nested-components
      cell: ({ row }) => {
        const item = row.original;
        return (
          <Link
            href={`/reviews/${item.id}${returnQuery ? `?${returnQuery}` : detailScenario ? `?fixture=${detailScenario}` : ''}`}
            className="block min-w-0"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="truncate font-medium">
              {item.repository} · #{item.pull_request_number}
            </p>
            <p className="truncate text-muted-foreground">
              {item.pull_request_title ?? t('untitled')}
            </p>
          </Link>
        );
      },
    }),
    columnHelper.display({
      id: 'status',
      header: () => common('status'),
      // oxlint-disable-next-line react/no-unstable-nested-components
      cell: ({ row }) => <StatusBadge status={row.original.status} t={t} />,
    }),
    columnHelper.display({
      id: 'runId',
      header: () => t('runId'),
      // oxlint-disable-next-line react/no-unstable-nested-components
      cell: ({ row }) => <span className="font-mono text-xs">#{row.original.id}</span>,
    }),
    columnHelper.display({
      id: 'model',
      header: () => t('model'),
      // oxlint-disable-next-line react/no-unstable-nested-components
      cell: ({ row }) => (
        <>
          {row.original.model ?? '—'}
          <span className="block text-xs text-muted-foreground">
            {row.original.reasoning ?? '—'}
          </span>
        </>
      ),
    }),
    columnHelper.display({
      id: 'findings',
      header: () => t('findings'),
      // oxlint-disable-next-line react/no-unstable-nested-components
      cell: ({ row }) => (
        <>
          {row.original.findings_count ?? '—'}
          {row.original.highest_severity ? (
            <span className="block text-xs text-muted-foreground">
              {t(row.original.highest_severity)}
            </span>
          ) : null}
        </>
      ),
    }),
    columnHelper.display({
      id: 'evaluation',
      header: () => t('evaluation'),
      // oxlint-disable-next-line react/no-unstable-nested-components
      cell: ({ row }) => {
        const value = row.original.review_evaluation;
        return (
          <span className="text-sm">
            {value ? t(value) : t('notEvaluated')} · {row.original.evaluated_findings}/
            {row.original.total_findings}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'duration',
      header: () => t('duration'),
      // oxlint-disable-next-line react/no-unstable-nested-components
      cell: ({ row }) => formatDuration(row.original.duration_ms),
    }),
    columnHelper.display({
      id: 'timing',
      header: () => t('timing'),
      // oxlint-disable-next-line react/no-unstable-nested-components
      cell: ({ row }) => (
        <div className="flex flex-col text-xs">
          <span>
            {t('started')}:{' '}
            <RelativeTime value={row.original.started_at ?? row.original.created_at} />
          </span>
          <span className="text-muted-foreground">
            {t('completed')}: <RelativeTime value={row.original.completed_at} />
          </span>
        </div>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: () => t('actions'),
      // oxlint-disable-next-line react/no-unstable-nested-components
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          aria-label={t('openGitHub')}
          onClick={(event) => event.stopPropagation()}
          render={
            <a
              href={`https://github.com/${row.original.repository}/pull/${row.original.pull_request_number}`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <ExternalLinkIcon aria-hidden="true" />
        </Button>
      ),
    }),
  ];
}

export function columnClass(id: string) {
  if (id === 'runId') {
    return 'hidden md:table-cell';
  }
  if (id === 'model') {
    return 'hidden lg:table-cell';
  }
  if (id === 'duration') {
    return 'hidden sm:table-cell';
  }
  if (id === 'timing') {
    return 'hidden xl:table-cell';
  }
  if (id === 'actions') {
    return 'text-right';
  }
  return undefined;
}

function StatusBadge({ status, t }: { status: string; t: Translation }) {
  return (
    <Badge
      variant={
        status === 'failed' ? 'destructive' : status === 'completed' ? 'secondary' : 'outline'
      }
    >
      {t(status)}
    </Badge>
  );
}

export function RelativeTime({ value }: { value: string | null }) {
  const t = useTranslations('reviews');
  const [now, setNow] = useState<number | null>(null);
  // Relative labels intentionally hydrate after the stable server-rendered timestamp.
  // eslint-disable-next-line @eslint-react/set-state-in-effect
  useEffect(() => setNow(Date.now()), []);
  if (!value) {
    return <>—</>;
  }
  return (
    <time dateTime={value} title={value}>
      {now === null ? '—' : formatRelativeTime(value, now, t)}
    </time>
  );
}

function formatRelativeTime(value: string, now: number, t: Translation): string {
  const minutes = Math.floor(Math.max(0, now - Date.parse(value)) / 60_000);
  if (minutes < 1) {
    return t('relativeNow');
  }
  if (minutes < 60) {
    return t('relativeMinutes', { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t('relativeHours', { count: hours });
  }
  return t('relativeDays', { count: Math.floor(hours / 24) });
}

function formatDuration(value: number | null): string {
  if (value === null) {
    return '—';
  }
  const seconds = Math.round(value / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}
