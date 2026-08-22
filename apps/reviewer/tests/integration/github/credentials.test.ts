import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CredentialStore } from '../../../src/github/credentials.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('CredentialStore', () => {
  it('stores GitHub App credentials in separate private files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'leverframe-test-'));
    temporaryDirectories.push(directory);
    const store = new CredentialStore(directory);
    const credentials = {
      appId: 42,
      clientId: 'client-id',
      name: 'leverframe',
      privateKey: 'private-key',
      slug: 'leverframe',
      webhookSecret: 'webhook-secret-long-enough',
    };

    store.write(credentials);

    expect(store.exists()).toBe(true);
    expect(store.read()).toEqual(credentials);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    for (const file of ['github-app.json', 'github-app.pem', 'github-webhook-secret']) {
      expect(statSync(join(directory, file)).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(join(directory, 'github-app.json'), 'utf8')).not.toContain('private-key');
  });
});
