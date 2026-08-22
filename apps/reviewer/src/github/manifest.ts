import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { productUserAgent } from '../identity.js';
import type { GitHubAppCredentials } from './credentials.js';

const conversionSchema = z.object({
  client_id: z.string().min(1),
  id: z.number().int().positive(),
  name: z.string().min(1),
  pem: z.string().min(1),
  slug: z.string().min(1),
  webhook_secret: z.string().min(16),
});

export interface GitHubManifestRegistration {
  manifest: string;
  state: string;
}

export function createGitHubManifestRegistration(
  uiBaseUrl: string,
  webhookUrl: string,
  githubAppName: string,
): GitHubManifestRegistration {
  const state = randomBytes(32).toString('hex');
  const uiOrigin = new URL(uiBaseUrl).origin;
  const redirectUrl = new URL('/setup/github/callback', uiBaseUrl).toString();
  const manifest = JSON.stringify({
    default_events: ['issue_comment', 'pull_request'],
    default_permissions: {
      checks: 'write',
      contents: 'read',
      issues: 'read',
      metadata: 'read',
      pull_requests: 'write',
    },
    description: 'A local-first control plane for running AI work loops to verified completion',
    hook_attributes: {
      active: true,
      url: webhookUrl,
    },
    name: githubAppName,
    public: false,
    redirect_url: redirectUrl,
    url: uiOrigin,
  });

  return { manifest, state };
}

export async function convertGitHubManifestCode(code: string): Promise<GitHubAppCredentials> {
  const response = await fetch(
    `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      headers: {
        'accept': 'application/vnd.github+json',
        'user-agent': productUserAgent,
        'x-github-api-version': '2022-11-28',
      },
      method: 'POST',
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub manifest conversion failed: ${response.status}`);
  }

  const result = conversionSchema.parse(await response.json());
  return {
    appId: result.id,
    clientId: result.client_id,
    name: result.name,
    privateKey: result.pem,
    slug: result.slug,
    webhookSecret: result.webhook_secret,
  };
}
