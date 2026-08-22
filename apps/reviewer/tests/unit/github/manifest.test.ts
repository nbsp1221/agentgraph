import { describe, expect, it } from 'vitest';
import { createGitHubManifestRegistration } from '../../../src/github/manifest.js';

describe('GitHub App manifest registration', () => {
  it('keeps the private UI URL separate from the public webhook URL', () => {
    const registration = createGitHubManifestRegistration(
      'https://leverframe.retn0.dev/',
      'https://github.example.com/webhooks/github',
      'leverframe-app',
    );
    const manifest = JSON.parse(registration.manifest) as Record<string, unknown>;

    expect(manifest.url).toBe('https://leverframe.retn0.dev');
    expect(manifest.redirect_url).toBe('https://leverframe.retn0.dev/setup/github/callback');
    expect((manifest.hook_attributes as { url: string }).url).toBe(
      'https://github.example.com/webhooks/github',
    );
  });
});
