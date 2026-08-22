'use client';

import { type ReviewEvaluation, evaluationWriteResponseSchema } from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@repo/ui/components/collapsible';
import { Separator } from '@repo/ui/components/separator';
import { Spinner } from '@repo/ui/components/spinner';
import { Textarea } from '@repo/ui/components/textarea';
import { ToggleGroup, ToggleGroupItem } from '@repo/ui/components/toggle-group';
import { ChevronDownIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { registerDirtyNavigation } from '../../lib/dirty-navigation';
import { EvaluationTime } from './evaluation-time';
import { useEvaluationTransport } from './evaluation-transport';

type Props = {
  reviewId: number;
  target: 'review' | 'finding';
  fingerprint?: string;
  current: ReviewEvaluation | null;
  fallbackVerdict?: string | null;
  history: ReviewEvaluation[];
  disabled?: boolean;
  disabledReason?: 'artifact' | 'incomplete' | 'evaluations';
};

export function ReviewEvaluationPanel({
  reviewId,
  target,
  fingerprint,
  current,
  fallbackVerdict = null,
  history,
  disabled = false,
  disabledReason,
}: Props) {
  const t = useTranslations('reviewDetail');
  const verdicts =
    target === 'review'
      ? (['useful', 'mixed', 'not_useful', 'unable_to_assess'] as const)
      : (['valid', 'partially_valid', 'false_positive', 'unable_to_verify'] as const);
  const transport = useEvaluationTransport();
  const initialVerdict = current?.verdict ?? fallbackVerdict ?? '';
  const [verdict, setVerdict] = useState<string>(initialVerdict);
  const [rationale, setRationale] = useState(current?.rationale ?? '');
  const [baselineVerdict, setBaselineVerdict] = useState(initialVerdict);
  const [baselineRationale, setBaselineRationale] = useState(current?.rationale ?? '');
  const [activeEvaluation, setActiveEvaluation] = useState(current);
  const [evaluationHistory, setEvaluationHistory] = useState(() =>
    [...history].sort((left, right) => right.id - left.id),
  );
  const [previousId, setPreviousId] = useState<number | null>(
    () => current?.id ?? latestRevisionId(history),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = !disabled && (verdict !== baselineVerdict || rationale !== baselineRationale);

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const unregisterNavigation = registerDirtyNavigation(t('evaluationUnsavedConfirm'));

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => {
      unregisterNavigation();
      window.removeEventListener('beforeunload', handler);
    };
  }, [dirty, t]);

  async function save() {
    if (!verdict || disabled) {
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const path =
      target === 'review'
        ? `/api/v1/reviews/${reviewId}/evaluation`
        : `/api/v1/reviews/${reviewId}/findings/${fingerprint}/evaluation`;
    try {
      const response = await transport(path, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          verdict,
          rationale: rationale || undefined,
          expected_previous_id: previousId,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(response.status === 409 ? t('evaluationConflict') : t('evaluationSaveFailed'));
        return;
      }
      const parsed = evaluationWriteResponseSchema.safeParse(body);
      if (!parsed.success) {
        setError(t('evaluationSaveFailed'));
        return;
      }
      setMessage(t('evaluationSaved'));
      setActiveEvaluation(parsed.data.current);
      setEvaluationHistory((existing) =>
        existing.some((revision) => revision.id === parsed.data.revision.id)
          ? existing
          : [parsed.data.revision, ...existing],
      );
      const next = parsed.data.current;
      setPreviousId(next?.id ?? null);
      setBaselineVerdict(next?.verdict ?? verdict);
      setBaselineRationale(next?.rationale ?? rationale);
      setRationale(next?.rationale ?? rationale);
    } catch {
      setError(t('evaluationSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function withdraw() {
    if (!activeEvaluation || previousId === null || disabled) {
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const path =
      target === 'review'
        ? `/api/v1/reviews/${reviewId}/evaluation`
        : `/api/v1/reviews/${reviewId}/findings/${fingerprint}/evaluation`;
    try {
      const response = await transport(path, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expected_previous_id: previousId }),
      });
      if (!response.ok) {
        setError(response.status === 409 ? t('evaluationConflict') : t('evaluationSaveFailed'));
        return;
      }
      const body: unknown = await response.json();
      const parsed = evaluationWriteResponseSchema.safeParse(body);
      if (!parsed.success) {
        setError(t('evaluationSaveFailed'));
        return;
      }
      setEvaluationHistory((existing) =>
        existing.some((revision) => revision.id === parsed.data.revision.id)
          ? existing
          : [parsed.data.revision, ...existing],
      );
      setActiveEvaluation(null);
      setVerdict('');
      setRationale('');
      setPreviousId(parsed.data.revision.id);
      setBaselineVerdict('');
      setBaselineRationale('');
      setMessage(t('evaluationWithdrawn'));
    } catch {
      setError(t('evaluationSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <Separator />
      <ToggleGroup
        aria-label={t('chooseEvaluation')}
        value={verdict ? [verdict] : []}
        onValueChange={(value) => setVerdict(value[0] ?? '')}
        disabled={disabled || saving}
        variant="outline"
        size="sm"
      >
        {verdicts.map((item) => (
          <ToggleGroupItem key={item} value={item} aria-label={t(item)}>
            {t(item)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Textarea
        value={rationale}
        disabled={disabled || saving}
        maxLength={4000}
        onChange={(event) => setRationale(event.target.value)}
        placeholder={t('rationalePlaceholder')}
        aria-label={t('rationale')}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || saving || !verdict}
          onClick={() => {
            void save();
          }}
        >
          {saving ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
          {t('saveEvaluation')}
        </Button>
        {activeEvaluation ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || saving || dirty}
            onClick={() => {
              void withdraw();
            }}
          >
            {t('withdrawEvaluation')}
          </Button>
        ) : null}
      </div>
      {disabled ? (
        <p className="text-xs text-muted-foreground">
          {t(
            disabledReason === 'artifact'
              ? 'evaluationUnavailableArtifact'
              : disabledReason === 'incomplete'
                ? 'evaluationUnavailableIncomplete'
                : 'evaluationUnavailableEvaluations',
          )}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t('evaluationError')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {activeEvaluation ? (
        <p className="text-xs text-muted-foreground">
          {t('provenance')}: {t('manual')} · <EvaluationTime value={activeEvaluation.created_at} />
        </p>
      ) : null}
      {evaluationHistory.length > 1 ? (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-xs underline">
            {t('viewHistory')}
            <ChevronDownIcon aria-hidden="true" className="size-3" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            {evaluationHistory.map((revision) => (
              <div key={revision.id}>
                <Badge variant="outline">{t(`${revision.action}EvaluationRevision`)}</Badge>{' '}
                {revision.verdict ? t(revision.verdict) : '—'} ·{' '}
                <EvaluationTime value={revision.created_at} />
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function latestRevisionId(history: ReviewEvaluation[]): number | null {
  return history.reduce<number | null>(
    (latest, revision) => (latest === null || revision.id > latest ? revision.id : latest),
    null,
  );
}
