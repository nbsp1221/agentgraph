import { Button } from '@leverframe/ui/components/button';
import { getTranslations } from 'next-intl/server';
import { Link } from '../../i18n/navigation';

export async function ReviewDetailNotFoundState({
  returnQuery = '',
}: {
  returnQuery?: string | undefined;
}) {
  const t = await getTranslations('reviewDetail');
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{t('notFoundTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('notFoundDescription')}</p>
      <Button
        nativeButton={false}
        render={<Link href={`/reviews${returnQuery ? `?${returnQuery}` : ''}`} />}
      >
        {t('backToList')}
      </Button>
    </div>
  );
}
