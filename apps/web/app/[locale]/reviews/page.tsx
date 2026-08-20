import { ReviewDashboard } from '../../../src/features/reviews/review-dashboard';
import { getReviewData } from '../../../src/features/reviews/review-data';

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedScenario = typeof params.fixture === 'string' ? params.fixture : undefined;

  const useFixture =
    process.env.NODE_ENV === 'development' &&
    (requestedScenario !== undefined || process.env.REVIEWER_INTERNAL_URL === undefined);
  if (useFixture) {
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
        searchParams={params}
        allowControls={isFixtureControlEnabled(process.env.NODE_ENV)}
      />
    );
  }

  const data = await getReviewData(
    new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) => [
        [key, Array.isArray(value) ? (value[0] ?? '') : (value ?? '')],
      ]),
    ),
  );
  return <ReviewDashboard data={data} />;
}
