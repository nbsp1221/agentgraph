import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const serverConfigSchema = z.object({
  allowedOwnerId: z.number().int().positive(),
  credentialsDirectory: z.string().min(1),
  databasePath: z.string().min(1),
  host: z.string().min(1),
  jobsDirectory: z.string().min(1),
  githubAppName: z.string().min(1),
  model: z.string().min(1),
  port: z.number().int().min(1).max(65_535),
  publicBaseUrl: z.url(),
  reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']),
  resourcesDirectory: z.string().min(1),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

function validateReviewResources(resourcesDirectory: string): void {
  const promptPath = join(resourcesDirectory, 'review-prompt.md');
  let prompt: string;
  try {
    prompt = readFileSync(promptPath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read required review prompt: ${promptPath}`, { cause: error });
  }
  if (prompt.trim().length === 0) {
    throw new Error(`Required review prompt is empty: ${promptPath}`);
  }

  const schemaPath = join(resourcesDirectory, 'review-schema.json');
  let schema: string;
  try {
    schema = readFileSync(schemaPath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read required review schema: ${schemaPath}`, { cause: error });
  }
  try {
    const parsed: unknown = JSON.parse(schema);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('schema must contain a JSON object');
    }
  } catch (error) {
    throw new Error(`Required review schema is not valid JSON: ${schemaPath}`, { cause: error });
  }
}

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDirectory = environment.APP_DATA_DIRECTORY ?? join(process.cwd(), '.agentgraph');
  const port = Number(environment.APP_PORT ?? '6571');
  // The application root is the process working directory in source and container modes.
  const resourcesDirectory =
    environment.APP_RESOURCES_DIRECTORY ?? join(process.cwd(), 'resources');
  validateReviewResources(resourcesDirectory);

  return serverConfigSchema.parse({
    allowedOwnerId: Number(environment.GITHUB_ALLOWED_OWNER_ID),
    credentialsDirectory:
      environment.GITHUB_CREDENTIALS_DIRECTORY ?? join(dataDirectory, 'credentials'),
    databasePath: join(dataDirectory, 'state.sqlite'),
    host: environment.APP_HOST ?? '127.0.0.1',
    jobsDirectory: join(dataDirectory, 'jobs'),
    githubAppName: environment.GITHUB_APP_NAME,
    model: environment.REVIEW_MODEL ?? 'gpt-5.6-sol',
    port,
    publicBaseUrl: environment.APP_PUBLIC_URL ?? `http://127.0.0.1:${port}`,
    reasoningEffort: environment.REVIEW_REASONING_EFFORT ?? 'high',
    resourcesDirectory,
  });
}
