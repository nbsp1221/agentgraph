import { Alert, AlertDescription, AlertTitle } from '@leverframe/ui/components/alert';
import { Button } from '@leverframe/ui/components/button';
import { AlertCircleIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '../../i18n/navigation';

export async function ReviewDetailErrorState({
  kind,
  reviewId,
  returnQuery = '',
}: {
  kind: string;
  reviewId: string;
  returnQuery?: string;
}) {
  const t = await getTranslations('reviewDetail');
  const key = `error_${kind}`;
  const errorKey = [
    'missing-config',
    'config-error',
    'network-error',
    'schema-error',
    'http-error',
  ].includes(kind)
    ? key
    : 'error_generic';
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        <AlertTitle>{t('errorTitle')}</AlertTitle>
        <AlertDescription>{t(errorKey)}</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          render={<Link href={`/reviews/${reviewId}${returnQuery ? `?${returnQuery}` : ''}`} />}
        >
          {t('retry')}
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/reviews${returnQuery ? `?${returnQuery}` : ''}`} />}
        >
          {t('backToList')}
        </Button>
      </div>
    </div>
  );
}
