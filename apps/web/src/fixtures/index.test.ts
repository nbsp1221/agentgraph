import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import { healthDescriptionKey } from './health';
import { createFixture, fixtureScenarios, isFixtureControlEnabled } from './index';

describe('fixture harness', () => {
  it('creates every named scenario with a typed shell state', () => {
    for (const scenario of fixtureScenarios) {
      expect(createFixture(scenario).fixtureOnly).toBe(true);
    }
  });

  it('does not enable fixture controls in production', () => {
    expect(isFixtureControlEnabled('production')).toBe(false);
    expect(isFixtureControlEnabled('development')).toBe(true);
  });

  it('keeps loading, empty, and error states distinct', () => {
    expect(createFixture('loading').listState).toBe('loading');
    expect(createFixture('empty-history').listState).toBe('empty');
    expect(createFixture('list-error').listState).toBe('error');
  });

  it('maps every health status to an existing localized reviews message', () => {
    const statuses = ['healthy', 'degraded', 'unavailable'] as const;
    for (const status of statuses) {
      const key = healthDescriptionKey(status);
      expect(en.reviews[key]).toBeTruthy();
      expect(ko.reviews[key]).toBeTruthy();
    }
  });
});
