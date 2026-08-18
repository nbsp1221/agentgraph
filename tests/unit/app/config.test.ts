import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../../../src/app/config.js';

describe('server configuration', () => {
  it('derives cohesive state paths from one data directory', () => {
    expect(
      loadServerConfig({
        APP_DATA_DIRECTORY: '/workspace/.agentgraph',
        APP_PORT: '6571',
        APP_PUBLIC_URL: 'https://agentgraph.example.com',
        GITHUB_ALLOWED_OWNER_ID: '42',
        GITHUB_APP_NAME: 'example-agentgraph-app',
        REVIEW_MODEL: 'review-model',
        REVIEW_REASONING_EFFORT: 'medium',
      }),
    ).toMatchObject({
      allowedOwnerId: 42,
      credentialsDirectory: '/workspace/.agentgraph/credentials',
      databasePath: '/workspace/.agentgraph/state.sqlite',
      jobsDirectory: '/workspace/.agentgraph/jobs',
      githubAppName: 'example-agentgraph-app',
      model: 'review-model',
      port: 6571,
      publicBaseUrl: 'https://agentgraph.example.com',
      reasoningEffort: 'medium',
      resourcesDirectory: join(process.cwd(), 'resources'),
    });
  });

  it('uses the application-root resources in source mode', () => {
    expect(
      loadServerConfig({
        APP_PUBLIC_URL: 'https://agentgraph.example.com',
        GITHUB_ALLOWED_OWNER_ID: '42',
        GITHUB_APP_NAME: 'example-agentgraph-app',
      }).resourcesDirectory,
    ).toBe(join(process.cwd(), 'resources'));
  });

  it('validates an explicit resource directory during startup', () => {
    const resourcesDirectory = mkdtempSync(join(tmpdir(), 'agentgraph-resources-'));
    mkdirSync(resourcesDirectory, { recursive: true });
    writeFileSync(join(resourcesDirectory, 'review-prompt.md'), 'Review the change.\n');
    writeFileSync(join(resourcesDirectory, 'review-schema.json'), '{"type":"object"}\n');

    try {
      expect(
        loadServerConfig({
          APP_PUBLIC_URL: 'https://agentgraph.example.com',
          APP_RESOURCES_DIRECTORY: resourcesDirectory,
          GITHUB_ALLOWED_OWNER_ID: '42',
          GITHUB_APP_NAME: 'example-agentgraph-app',
        }).resourcesDirectory,
      ).toBe(resourcesDirectory);
    } finally {
      rmSync(resourcesDirectory, { force: true, recursive: true });
    }
  });

  it('fails startup when a required review resource is missing', () => {
    const resourcesDirectory = mkdtempSync(join(tmpdir(), 'agentgraph-resources-'));
    try {
      writeFileSync(join(resourcesDirectory, 'review-prompt.md'), 'Review the change.\n');

      expect(() =>
        loadServerConfig({
          APP_PUBLIC_URL: 'https://agentgraph.example.com',
          APP_RESOURCES_DIRECTORY: resourcesDirectory,
          GITHUB_ALLOWED_OWNER_ID: '42',
          GITHUB_APP_NAME: 'example-agentgraph-app',
        }),
      ).toThrow(/review-schema\.json/);
    } finally {
      rmSync(resourcesDirectory, { force: true, recursive: true });
    }
  });

  it('uses the quality-first review defaults', () => {
    expect(
      loadServerConfig({
        APP_PUBLIC_URL: 'https://agentgraph.example.com',
        GITHUB_ALLOWED_OWNER_ID: '42',
        GITHUB_APP_NAME: 'example-agentgraph-app',
      }),
    ).toMatchObject({
      model: 'gpt-5.6-sol',
      reasoningEffort: 'high',
    });
  });

  it('rejects unsupported reasoning effort instead of silently falling back', () => {
    expect(() =>
      loadServerConfig({
        APP_PUBLIC_URL: 'https://agentgraph.example.com',
        GITHUB_ALLOWED_OWNER_ID: '42',
        GITHUB_APP_NAME: 'example-agentgraph-app',
        REVIEW_REASONING_EFFORT: 'automatic',
      }),
    ).toThrow();
  });

  it('requires an explicit GitHub owner account', () => {
    expect(() => loadServerConfig({})).toThrow();
  });
});
