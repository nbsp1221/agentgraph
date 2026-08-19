import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import type { CredentialStore } from '../github/credentials.js';
import type { JobDatabase } from '../jobs/database.js';
import type { ServerConfig } from './config.js';
import { registerGitHubRoutes } from './routes/github.js';
import { registerReviewRoutes } from './routes/reviews.js';
import {
  type Dependency,
  type Observation,
  type ServerHooks,
  createObservations,
} from './server-common.js';

export type { ServerHooks } from './server-common.js';

function createApi(
  config: ServerConfig,
  database: JobDatabase,
  credentials: CredentialStore,
  hooks: ServerHooks,
): Hono {
  const app = new Hono();
  const observations = createObservations();

  const observed = (
    dependency: Dependency,
    status: Observation['status'],
    detail: string | null = null,
  ) => {
    observations[dependency] = { status, detail, last_observed_at: new Date().toISOString() };
  };

  const recordRead = () => {
    observed('api', 'healthy');
    observed('database', 'healthy');
  };

  registerGitHubRoutes(app, config, database, credentials, hooks, observed);
  registerReviewRoutes(app, database, hooks, observations, recordRead);
  return app;
}

export function createAgentGraphServer(
  config: ServerConfig,
  database: JobDatabase,
  credentials: CredentialStore,
  hooks: ServerHooks = {},
) {
  const listener = getRequestListener(createApi(config, database, credentials, hooks).fetch);
  return createServer((request, response) => {
    void listener(request, response);
  });
}
