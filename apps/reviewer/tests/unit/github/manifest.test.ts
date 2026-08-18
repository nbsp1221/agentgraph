import { describe, expect, it } from 'vitest';
import { createGitHubManifestRegistration } from '../../../src/github/manifest.js';

describe('GitHub App manifest registration', () => {
  it('keeps the private UI URL separate from the public webhook URL', () => {
    const registration = createGitHubManifestRegistration(
      'https://agentgraph.tailnet.example.com/',
      'https://github.example.com/webhooks/github',
      'agentgraph-app',
    );
    const manifest = JSON.parse(registration.manifest) as Record<string, unknown>;

    expect(manifest.url).toBe('https://agentgraph.tailnet.example.com');
    expect(manifest.redirect_url).toBe(
      'https://agentgraph.tailnet.example.com/setup/github/callback',
    );
    expect((manifest.hook_attributes as { url: string }).url).toBe(
      'https://github.example.com/webhooks/github',
    );
  });
});
