'use client';

import { parseAsIndex, parseAsString, parseAsStringLiteral } from 'nuqs';
import { reviewEvaluationValues, reviewStatusValues } from './review-query';

export const reviewQueryParsers = {
  query: parseAsString.withDefault(''),
  status: parseAsStringLiteral(reviewStatusValues).withDefault('all'),
  evaluation: parseAsStringLiteral(reviewEvaluationValues).withDefault('all'),
  page: parseAsIndex.withDefault(1),
};
