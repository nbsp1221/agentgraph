import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reviewResultSchema } from '../../../src/review/result.js';

describe('review result compatibility', () => {
  it('keeps stored results from before coverage and finding updates readable', () => {
    expect(
      reviewResultSchema.parse({
        findings: [],
        limitations: [],
        summary: 'Legacy review',
        tests_run: [],
      }),
    ).toMatchObject({ summary: 'Legacy review' });
  });

  it('keeps the model output schema valid JSON', () => {
    expect(() => {
      const schema: unknown = JSON.parse(
        readFileSync(new URL('../../../resources/review-schema.json', import.meta.url), 'utf8'),
      );
      expect(schema).toBeTypeOf('object');
    }).not.toThrow();
  });
});
