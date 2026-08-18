import type { ReviewDetail } from '@agentgraph/contracts';
import { Alert, AlertDescription, AlertTitle } from '@agentgraph/ui/components/alert';
import { Badge } from '@agentgraph/ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@agentgraph/ui/components/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@agentgraph/ui/components/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@agentgraph/ui/components/select';
import { Skeleton } from '@agentgraph/ui/components/skeleton';
import { ActivityIcon, CircleAlertIcon, CircleCheckIcon, CircleXIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ReviewDetailPage } from '../features/reviews/review-detail';
import { ReviewDetailNotFoundState } from '../features/reviews/review-detail-not-found';
import { ReviewList } from '../features/reviews/review-list';
import {
  type FixtureScenario,
  type FixtureState,
  createFixture,
  fixtureDetailResponse,
  fixtureEvaluationsResponse,
  fixtureListResponse,
  fixtureScenarios,
  isFixtureScenario,
} from '../fixtures';
import { type HealthDescriptionKey, healthDescriptionKey } from '../fixtures/health';
import { Link } from '../i18n/navigation';
import { FixtureContextTransport } from './fixture-context-transport';
import { FixtureEvaluationTransport } from './fixture-evaluation-transport';

type CommonLabelKey =
  | 'status'
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'unknown'
  | 'api'
  | 'worker'
  | 'sandbox'
  | 'github';

type FixturePreviewProps = {
  requestedScenario?: string | undefined;
  searchParams?: Record<string, string | string[] | undefined> | undefined;
  allowControls: boolean;
};

export async function FixturePreview({
  requestedScenario,
  searchParams,
  allowControls,
}: FixturePreviewProps) {
  const t = await getTranslations('reviews');
  const scenario: FixtureScenario =
    allowControls && isFixtureScenario(requestedScenario) ? requestedScenario : 'default';
  const state = createFixture(scenario);
  const statusLabel = await getTranslations('common');

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {allowControls ? (
        <FixtureSelector scenario={scenario} label={t('fixture')} scenarios={fixtureScenarios} />
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">{t('reviewHistory')}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <HealthCard state={state} statusLabel={statusLabel} description={t} />
      <SummaryCards state={state} t={t} />
      <ReviewStateCard state={state} t={t} searchParams={searchParams} />
    </div>
  );
}

export function FixtureDetailPreview({
  requestedScenario,
  reviewId,
  allowControls,
  returnQuery,
}: {
  requestedScenario?: string | undefined;
  reviewId: number;
  allowControls: boolean;
  returnQuery?: string;
}) {
  const scenario: FixtureScenario =
    allowControls && isFixtureScenario(requestedScenario) ? requestedScenario : 'default';
  const state = createFixture(scenario);
  const detail = fixtureDetailResponse(state, reviewId);
  if (!detail) {
    return <ReviewDetailNotFoundState returnQuery={returnQuery} />;
  }
  const resolvedDetail: ReviewDetail = detail;
  const transportMode =
    scenario === 'saving-evaluation' || scenario === 'evaluation-save-failure'
      ? scenario === 'saving-evaluation'
        ? 'saving'
        : 'failure'
      : undefined;
  const contextMode =
    scenario === 'context-available' ||
    scenario === 'context-unavailable' ||
    scenario === 'context-loading' ||
    scenario === 'context-error'
      ? (scenario.replace('context-', '') as 'available' | 'unavailable' | 'loading' | 'error')
      : undefined;
  return (
    <FixtureContextTransport mode={contextMode}>
      <FixtureEvaluationTransport mode={transportMode}>
        <ReviewDetailPage
          detail={resolvedDetail}
          returnQuery={returnQuery}
          evaluations={fixtureEvaluationsResponse(state, reviewId) ?? null}
        />
      </FixtureEvaluationTransport>
    </FixtureContextTransport>
  );
}

function FixtureSelector({
  scenario,
  label,
  scenarios,
}: {
  scenario: FixtureScenario;
  label: string;
  scenarios: readonly FixtureScenario[];
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ActivityIcon aria-hidden="true" />
          {label}
        </div>
        <Select defaultValue={scenario}>
          <SelectTrigger size="sm" aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{label}</SelectLabel>
              {scenarios.map((item) => (
                <SelectItem
                  key={item}
                  value={item}
                  render={<Link href={`/reviews?fixture=${item}`} />}
                >
                  {item}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}

function HealthCard({
  state,
  statusLabel,
  description,
}: {
  state: FixtureState;
  statusLabel: (key: CommonLabelKey) => string;
  description: (key: HealthDescriptionKey) => string;
}) {
  const status = state.health.overall;
  const Icon =
    status === 'healthy' ? CircleCheckIcon : status === 'degraded' ? CircleAlertIcon : CircleXIcon;
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon aria-hidden="true" className="mt-0.5" />
          <div>
            <CardTitle>
              {statusLabel('status')}: {statusLabel(status)}
            </CardTitle>
            <CardDescription>{description(healthDescriptionKey(status))}</CardDescription>
          </div>
        </div>
        <Badge
          variant={
            status === 'healthy'
              ? 'secondary'
              : status === 'unavailable'
                ? 'destructive'
                : 'outline'
          }
        >
          {statusLabel(status)}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ['api', state.health.dependencies.api],
            ['worker', state.health.dependencies.worker],
            ['sandbox', state.health.dependencies.sandbox],
            ['github', state.health.dependencies.github],
          ] as const
        ).map(([name, value]) => (
          <div
            key={name}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
          >
            <span className="text-muted-foreground">{statusLabel(name)}</span>
            <span className="flex items-center gap-2 font-medium">
              <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
              {statusLabel(value)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SummaryCards({ state, t }: { state: FixtureState; t: (key: string) => string }) {
  const active = state.reviews.filter((item) => item.status === 'running').length;
  const last = state.reviews.find((item) => item.status === 'completed');
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardDescription>{t('active')}</CardDescription>
          <CardTitle>{active}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {active ? t('running') : t('noActiveRuns')}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>{t('lastCompleted')}</CardDescription>
          <CardTitle>{last ? `#${last.id}` : '—'}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {last ? t('recentlyCompleted') : t('noCompletedRuns')}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>{t('needsEvaluation')}</CardDescription>
          <CardTitle>
            {
              state.reviews.filter(
                (item) => item.review_evaluation === null && item.status === 'completed',
              ).length
            }
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t('humanReviewJudgments')}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewStateCard({
  state,
  t,
  searchParams,
}: {
  state: FixtureState;
  t: (key: string) => string;
  searchParams?: Record<string, string | string[] | undefined> | undefined;
}) {
  if (state.listState === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('reviewHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </CardContent>
      </Card>
    );
  }
  if (state.listState === 'error') {
    return (
      <Alert variant="destructive">
        <CircleXIcon aria-hidden="true" />
        <AlertTitle>{t('errorTitle')}</AlertTitle>
        <AlertDescription>{t('errorDescription')}</AlertDescription>
        <ButtonRetry label={t('retry')} />
      </Alert>
    );
  }
  if (state.listState === 'empty' || state.listState === 'filtered-empty') {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ActivityIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            {state.listState === 'empty' ? t('emptyTitle') : t('filteredEmptyTitle')}
          </EmptyTitle>
          <EmptyDescription>
            {state.listState === 'empty' ? t('emptyDescription') : t('filteredEmptyDescription')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const value = (key: string) => {
    const raw = searchParams?.[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  return (
    <ReviewList
      detailScenario={state.scenario}
      response={fixtureListResponse(state, {
        page: Number(value('page')) || 1,
        query: value('query'),
        status: value('status'),
        evaluation: value('evaluation'),
      })}
    />
  );
}

function ButtonRetry({ label }: { label: string }) {
  return (
    <Link
      className="mt-2 inline-flex text-sm font-medium underline underline-offset-4"
      href="/reviews"
    >
      {label}
    </Link>
  );
}
