'use client';

import { Alert, AlertDescription, AlertTitle } from '@leverframe/ui/components/alert';
import { Button } from '@leverframe/ui/components/button';
import { AlertCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ReviewDetailError({ reset }: { reset: () => void }) {
  const t = useTranslations('reviews');
  const common = useTranslations('common');
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        <AlertTitle>{t('errorTitle')}</AlertTitle>
        <AlertDescription>{t('errorDescription')}</AlertDescription>
        <Button variant="outline" onClick={reset}>
          {common('retry')}
        </Button>
      </Alert>
    </div>
  );
}
