import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import { healthDescriptionKey } from './health';
import {
  createFixture,
  fixtureListResponse,
  fixtureScenarios,
  isFixtureControlEnabled,
} from './index';

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

  it('paginates fixture responses and keeps named active reviews visible', () => {
    const pageTwo = fixtureListResponse(createFixture('pagination'), { page: 2 });
    expect(pageTwo.page).toBe(2);
    expect(pageTwo.items).toHaveLength(4);
    expect(pageTwo.items[0]?.id).toBe(221);

    const running = fixtureListResponse(createFixture('running'));
    expect(running.items[0]?.id).toBe(240);
    expect(running.items[0]?.status).toBe('running');
  });

  it('uses the public evaluation taxonomy when applying fixture filters', () => {
    const state = createFixture('default');
    const needsEvaluation = fixtureListResponse(state, { evaluation: 'needs_evaluation' });
    expect(needsEvaluation.items.every((item) => item.status === 'completed')).toBe(true);
    expect(needsEvaluation.items.every((item) => item.review_evaluation === null)).toBe(true);
  });
});
