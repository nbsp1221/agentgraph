import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const repositoryPolicySchema = z
  .object({
    review: z
      .object({
        instructions: z.array(z.string().min(1).max(500)).max(20).default([]),
      })
      .strict()
      .default({ instructions: [] }),
    version: z.literal(1),
  })
  .strict();

export interface RepositoryPolicy {
  readonly review: {
    readonly instructions: readonly string[];
  };
  readonly version: 1;
}

export function parseRepositoryPolicy(source: string): RepositoryPolicy {
  const parsed = parseYaml(source) as unknown;
  const policy = repositoryPolicySchema.parse(parsed);
  return Object.freeze({
    review: Object.freeze({ instructions: Object.freeze([...policy.review.instructions]) }),
    version: policy.version,
  });
}
