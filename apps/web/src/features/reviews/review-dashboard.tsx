import type { ReactNode } from 'react';
import { Badge } from '@repo/ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReviewDataSource } from './review-data';
import { ReviewList } from './review-list';
import { RelativeTime } from './review-list-columns';

export async function ReviewDashboard({ data }: { data: ReviewDataSource }) {
  const t = await getTranslations('reviews');
  const common = await getTranslations('common');
  const reviews = data.reviews.kind === 'ok' ? data.reviews.data : null;
  const status = data.status.kind === 'ok' ? data.status.data : null;
  const Icon =
    status?.overall === 'healthy'
      ? CircleCheckIcon
      : status?.overall === 'unavailable'
        ? CircleXIcon
        : CircleAlertIcon;
  const dependencies = [
    ['api', status?.api],
    ['worker', status?.worker],
    ['sandbox', status?.sandbox],
    ['github', status?.github],
  ] as const;
  const completed = data.completed.kind === 'ok' ? data.completed.data.items[0] : undefined;
  const needsEvaluation =
    data.needsEvaluation.kind === 'ok' ? data.needsEvaluation.data.total_items : null;
  const stageSummary = status
    ? Object.entries(status.active_stages)
        .filter(([, count]) => count > 0)
        .map(([stage, count]) => `${t(`stage_${stage}`)} ${count}`)
        .join(' · ')
    : '';
  const healthDescription = !status
    ? 'healthErrorDescription'
    : status.overall === 'healthy'
      ? 'healthHealthyDescription'
      : status.overall === 'degraded'
        ? 'healthDegradedDescription'
        : status.overall === 'unknown'
          ? 'healthUnknownDescription'
          : 'healthUnavailableDescription';
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">{t('reviewHistory')}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Icon aria-hidden="true" />
            <div>
              <CardTitle>
                {common('status')}: {status ? common(status.overall) : common('unavailable')}
              </CardTitle>
              <CardDescription>
                {t(healthDescription)}
                {status ? (
                  <time
                    className="mt-1 block text-xs"
                    dateTime={status.observed_at}
                    title={status.observed_at}
                  >
                    {common('observed')}: {status.observed_at}
                  </time>
                ) : null}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={
              status?.overall === 'healthy'
                ? 'secondary'
                : status?.overall === 'unavailable' || !status
                  ? 'destructive'
                  : 'outline'
            }
          >
            {status ? common(status.overall) : common('unavailable')}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dependencies.map(([key, observation]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
            >
              <span className="text-muted-foreground">{common(key)}</span>
              <span className="flex flex-col items-end font-medium">
                <span>{observation ? common(observation.status) : common('unavailable')}</span>
                {observation?.last_observed_at ? (
                  <time
                    className="text-xs font-normal text-muted-foreground"
                    dateTime={observation.last_observed_at}
                    title={observation.last_observed_at}
                  >
                    {observation.last_observed_at}
                  </time>
                ) : null}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title={t('active')}
          value={status ? String(status.active_jobs) : '—'}
          description={stageSummary || t('activeSummary')}
        />
        <SummaryCard
          title={t('lastCompleted')}
          value={completed ? `#${completed.id}` : '—'}
          description={
            completed ? (
              <>
                {t('recentlyCompleted')} · <RelativeTime value={completed.completed_at} />
              </>
            ) : (
              t('noCompletedRuns')
            )
          }
        />
        <SummaryCard
          title={t('needsEvaluation')}
          value={needsEvaluation === null ? '—' : String(needsEvaluation)}
          description={t('humanReviewJudgments')}
        />
      </div>
      {reviews ? (
        <ReviewList response={reviews} error={data.reviews.kind !== 'ok'} />
      ) : (
        <ReviewList
          response={{ items: [], page: 1, page_size: 20, total_items: 0, total_pages: 0 }}
          error
        />
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
    </Card>
  );
}
