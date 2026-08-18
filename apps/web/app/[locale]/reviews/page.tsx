import { getTranslations } from 'next-intl/server';

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedScenario = typeof params.fixture === 'string' ? params.fixture : undefined;

  if (process.env.NODE_ENV === 'development') {
    const [{ FixturePreview }, { isFixtureControlEnabled }] = await Promise.all([
      import('../../../src/components/fixture-preview'),
      import('../../../src/fixtures'),
    ]);
    if (!FixturePreview || !isFixtureControlEnabled) {
      throw new Error('Development fixture harness unavailable');
    }
    return (
      <FixturePreview
        requestedScenario={requestedScenario}
        allowControls={isFixtureControlEnabled(process.env.NODE_ENV)}
      />
    );
  }

  const t = await getTranslations('reviews');
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('apiPlaceholder')}</p>
    </main>
  );
}
