import type { FixtureState } from './index';

export type HealthDescriptionKey =
  | 'healthHealthyDescription'
  | 'healthDegradedDescription'
  | 'healthUnavailableDescription';

export function healthDescriptionKey(
  status: FixtureState['health']['overall'],
): HealthDescriptionKey {
  return status === 'healthy'
    ? 'healthHealthyDescription'
    : status === 'degraded'
      ? 'healthDegradedDescription'
      : 'healthUnavailableDescription';
}
