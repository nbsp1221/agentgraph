import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import type { CredentialStore } from '../github/credentials.js';
import type { ManualCommand } from '../jobs/command.js';
import type {
  JobDatabase,
  PullRequestCancellationInput,
  PullRequestJobInput,
} from '../jobs/database.js';
import { convertGitHubManifestCode, createGitHubManifestRegistration } from '../github/manifest.js';
import { decideWebhook, verifyWebhookSignature } from '../github/webhook.js';
import type { ServerConfig } from './config.js';

const maximumWebhookBytes = 2 * 1024 * 1024;

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;

  for await (const chunk of request as AsyncIterable<Buffer>) {
    length += chunk.length;
    if (length > maximumWebhookBytes) {
      throw new Error('webhook body is too large');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

function sendHtml(response: ServerResponse, statusCode: number, value: string): void {
  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
  });
  response.end(value);
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function createAgentGraphServer(
  config: ServerConfig,
  database: JobDatabase,
  credentials: CredentialStore,
  hooks: {
    isSandboxAvailable?: () => boolean | Promise<boolean>;
    isWorkerRunning?: () => boolean | Promise<boolean>;
    onJobQueued?: (job: PullRequestJobInput) => void;
    onManualCommand?: (command: ManualCommand) => Promise<{ status: string }>;
    onPullRequestCancelled?: (cancellation: PullRequestCancellationInput) => void;
  } = {},
) {
  const registration = createGitHubManifestRegistration(config.publicBaseUrl, config.githubAppName);

  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    try {
      if (request.method === 'GET' && request.url === '/healthz') {
        const workerRunning = (await hooks.isWorkerRunning?.()) ?? true;
        const sandboxAvailable = (await hooks.isSandboxAvailable?.()) ?? true;
        const healthy = workerRunning && sandboxAvailable;
        sendJson(response, healthy ? 200 : 503, {
          status: healthy ? 'ok' : 'unhealthy',
        });
        return;
      }

      if (request.method === 'GET' && request.url === '/setup/github') {
        if (credentials.exists()) {
          sendHtml(response, 409, '<h1>GitHub App is already registered</h1>');
          return;
        }

        sendHtml(
          response,
          200,
          `<!doctype html><html><body><h1>Register ${escapeAttribute(config.githubAppName)}</h1><form method="post" action="https://github.com/settings/apps/new?state=${registration.state}"><input type="hidden" name="manifest" value="${escapeAttribute(registration.manifest)}"><button type="submit">Create GitHub App</button></form></body></html>`,
        );
        return;
      }

      if (request.method === 'GET' && request.url?.startsWith('/setup/github/callback?')) {
        if (credentials.exists()) {
          sendHtml(response, 409, '<h1>GitHub App is already registered</h1>');
          return;
        }

        const url = new URL(request.url, config.publicBaseUrl);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (code === null || state !== registration.state) {
          sendHtml(response, 400, '<h1>Invalid GitHub manifest callback</h1>');
          return;
        }

        const converted = await convertGitHubManifestCode(code);
        credentials.write(converted);
        sendHtml(
          response,
          201,
          `<h1>GitHub App registered</h1><p>Credentials were stored locally.</p><p><a href="https://github.com/apps/${encodeURIComponent(converted.slug)}/installations/new">Install the GitHub App</a></p>`,
        );
        return;
      }

      if (request.method !== 'POST' || request.url !== '/webhooks/github') {
        sendJson(response, 404, { error: 'not found' });
        return;
      }

      const body = await readBody(request);
      if (!credentials.exists()) {
        sendJson(response, 503, { error: 'GitHub App is not registered' });
        return;
      }

      const signature = request.headers['x-hub-signature-256'];
      if (
        !verifyWebhookSignature(
          body,
          typeof signature === 'string' ? signature : undefined,
          credentials.read().webhookSecret,
        )
      ) {
        sendJson(response, 401, { error: 'invalid signature' });
        return;
      }

      const deliveryId = request.headers['x-github-delivery'];
      const event = request.headers['x-github-event'];
      if (typeof deliveryId !== 'string' || typeof event !== 'string') {
        sendJson(response, 400, { error: 'missing GitHub headers' });
        return;
      }

      const decision = decideWebhook({
        allowedOwnerId: config.allowedOwnerId,
        body,
        deliveryId,
        event,
      });
      if (decision.kind === 'ignore') {
        sendJson(response, 202, decision);
        return;
      }

      if (decision.kind === 'cancel') {
        const result = database.cancelPullRequest(decision.cancellation);
        if (result.deliveryAccepted) {
          hooks.onPullRequestCancelled?.(decision.cancellation);
        }
        sendJson(response, 202, {
          deliveryAccepted: result.deliveryAccepted,
          jobsCancelled: result.jobsCancelled,
          status: result.deliveryAccepted ? 'cancelled' : 'duplicate',
        });
        return;
      }

      if (decision.kind === 'command') {
        if (hooks.onManualCommand === undefined) {
          sendJson(response, 202, { status: 'command handling unavailable' });
          return;
        }
        sendJson(response, 202, await hooks.onManualCommand(decision.command));
        return;
      }

      const result = database.enqueuePullRequest(decision.job);
      if (result.jobCreated) {
        hooks.onJobQueued?.(decision.job);
      }
      sendJson(response, 202, {
        deliveryAccepted: result.deliveryAccepted,
        jobCreated: result.jobCreated,
        jobsSuperseded: result.jobsSuperseded,
        status: result.jobCreated ? 'queued' : 'duplicate',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      sendJson(response, 400, { error: message });
    }
  };

  return createServer((request, response) => {
    void handleRequest(request, response);
  });
}
