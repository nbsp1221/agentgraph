'use client';

import { Alert, AlertDescription, AlertTitle } from '@agentgraph/ui/components/alert';
import { Button } from '@agentgraph/ui/components/button';
import { AlertCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ReviewDetailError({ reset }: { reset: () => void }) {
  const t = useTranslations('reviews');
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        <AlertTitle>{t('errorTitle')}</AlertTitle>
        <AlertDescription>{t('errorDescription')}</AlertDescription>
        <Button variant="outline" onClick={reset}>
          {t('retry')}
        </Button>
      </Alert>
    </div>
  );
}
