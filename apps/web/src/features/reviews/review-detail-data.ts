import {
  type EvaluationsResponse,
  type ReviewDetail,
  evaluationsResponseSchema,
  reviewDetailSchema,
} from '@repo/contracts';

export type ReviewDetailDataResult =
  | { kind: 'ok'; data: ReviewDetail }
  | { kind: 'missing-config' | 'config-error' | 'network-error' | 'schema-error' }
  | { kind: 'http-error'; status: number };

export type ReviewEvaluationsResult = { kind: 'ok'; data: EvaluationsResponse } | { kind: 'error' };

export async function getReviewDetail(reviewId: string): Promise<ReviewDetailDataResult> {
  const configuredBase = process.env.REVIEWER_INTERNAL_URL;
  if (!configuredBase) {
    return { kind: 'missing-config' };
  }
  let base: URL;
  try {
    base = new URL(`${configuredBase.replace(/\/+$/, '')}/`);
    if (!['http:', 'https:'].includes(base.protocol)) {
      throw new Error('reviewer URL must use http or https');
    }
  } catch {
    return { kind: 'config-error' };
  }
  try {
    const response = await fetch(new URL(`api/v1/reviews/${encodeURIComponent(reviewId)}`, base), {
      cache: 'no-store',
    });
    if (!response.ok) {
      return { kind: 'http-error', status: response.status };
    }
    const parsed = reviewDetailSchema.safeParse(await response.json());
    return parsed.success ? { kind: 'ok', data: parsed.data } : { kind: 'schema-error' };
  } catch {
    return { kind: 'network-error' };
  }
}

export async function getReviewEvaluations(reviewId: string): Promise<ReviewEvaluationsResult> {
  const configuredBase = process.env.REVIEWER_INTERNAL_URL;
  if (!configuredBase) {
    return { kind: 'error' };
  }
  let base: URL;
  try {
    base = new URL(`${configuredBase.replace(/\/+$/, '')}/`);
    if (!['http:', 'https:'].includes(base.protocol)) {
      throw new Error('invalid protocol');
    }
  } catch {
    return { kind: 'error' };
  }
  try {
    const response = await fetch(
      new URL(`api/v1/reviews/${encodeURIComponent(reviewId)}/evaluations`, base),
      { cache: 'no-store' },
    );
    if (!response.ok) {
      return { kind: 'error' };
    }
    const parsed = evaluationsResponseSchema.safeParse(await response.json());
    return parsed.success ? { kind: 'ok', data: parsed.data } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}
