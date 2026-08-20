import { describe, expect, it } from 'vitest';
import {
  deleteEvaluationRequestSchema,
  findingEvaluationWriteRequestSchema,
  findingParamsSchema,
  reviewEvaluationWriteRequestSchema,
  reviewIdParamsSchema,
  reviewListQuerySchema,
} from '../src/index.js';

describe('review API request contracts', () => {
  it('normalizes documented pagination and rejects unsupported page sizes', () => {
    expect(reviewListQuerySchema.parse({})).toMatchObject({
      page: 1,
      page_size: 20,
      sort: 'created',
    });
    expect(reviewListQuerySchema.parse({ page: '2', page_size: '20' }).page).toBe(2);
    expect(reviewListQuerySchema.safeParse({ page_size: '100' }).success).toBe(false);
    expect(reviewListQuerySchema.parse({ status: ['completed', 'failed'] }).status).toEqual([
      'completed',
      'failed',
    ]);
  });

  it('coerces positive review IDs and validates finding fingerprints', () => {
    expect(reviewIdParamsSchema.parse({ reviewId: '42' })).toEqual({ reviewId: 42 });
    expect(reviewIdParamsSchema.safeParse({ reviewId: '0' }).success).toBe(false);
    expect(findingParamsSchema.parse({ reviewId: '42', fingerprint: '0123456789abcdef' })).toEqual({
      reviewId: 42,
      fingerprint: '0123456789abcdef',
    });
    expect(
      findingParamsSchema.safeParse({ reviewId: '42', fingerprint: 'not-a-fingerprint' }).success,
    ).toBe(false);
  });

  it('keeps review and finding verdict taxonomies separate', () => {
    const common = { expected_previous_id: null, rationale: 'Human-approved evidence.' };
    expect(
      reviewEvaluationWriteRequestSchema.safeParse({ ...common, verdict: 'useful' }).success,
    ).toBe(true);
    expect(
      reviewEvaluationWriteRequestSchema.safeParse({ ...common, verdict: 'false_positive' })
        .success,
    ).toBe(false);
    expect(
      findingEvaluationWriteRequestSchema.safeParse({ ...common, verdict: 'false_positive' })
        .success,
    ).toBe(true);
    expect(
      findingEvaluationWriteRequestSchema.safeParse({ ...common, verdict: 'useful' }).success,
    ).toBe(false);
  });

  it('requires an explicit concurrency revision and bounds rationale length', () => {
    expect(reviewEvaluationWriteRequestSchema.safeParse({ verdict: 'useful' }).success).toBe(false);
    expect(
      reviewEvaluationWriteRequestSchema.safeParse({
        verdict: 'useful',
        rationale: 'a'.repeat(4_000),
        expected_previous_id: null,
      }).success,
    ).toBe(true);
    expect(
      reviewEvaluationWriteRequestSchema.safeParse({
        verdict: 'useful',
        rationale: 'a'.repeat(4_001),
        expected_previous_id: null,
      }).success,
    ).toBe(false);
    expect(deleteEvaluationRequestSchema.parse({ expected_previous_id: 7 })).toEqual({
      expected_previous_id: 7,
    });
    expect(deleteEvaluationRequestSchema.safeParse({}).success).toBe(false);
  });
});
