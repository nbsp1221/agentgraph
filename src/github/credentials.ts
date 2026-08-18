import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const githubAppMetadataSchema = z.object({
  appId: z.number().int().positive(),
  clientId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
});

export type GitHubAppMetadata = z.infer<typeof githubAppMetadataSchema>;

export interface GitHubAppCredentials extends GitHubAppMetadata {
  privateKey: string;
  webhookSecret: string;
}

export class CredentialStore {
  readonly #directory: string;

  constructor(directory: string) {
    this.#directory = directory;
  }

  exists(): boolean {
    return (
      existsSync(this.#metadataPath) &&
      existsSync(this.#privateKeyPath) &&
      existsSync(this.#webhookSecretPath)
    );
  }

  read(): GitHubAppCredentials {
    const metadata = githubAppMetadataSchema.parse(
      JSON.parse(readFileSync(this.#metadataPath, 'utf8')),
    );

    return {
      ...metadata,
      privateKey: readFileSync(this.#privateKeyPath, 'utf8'),
      webhookSecret: readFileSync(this.#webhookSecretPath, 'utf8').trim(),
    };
  }

  write(credentials: GitHubAppCredentials): void {
    mkdirSync(this.#directory, { recursive: true, mode: 0o700 });
    chmodSync(this.#directory, 0o700);

    writeFileSync(
      this.#metadataPath,
      `${JSON.stringify(
        {
          appId: credentials.appId,
          clientId: credentials.clientId,
          name: credentials.name,
          slug: credentials.slug,
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    writeFileSync(this.#privateKeyPath, credentials.privateKey, {
      mode: 0o600,
    });
    writeFileSync(this.#webhookSecretPath, `${credentials.webhookSecret}\n`, {
      mode: 0o600,
    });
    chmodSync(this.#metadataPath, 0o600);
    chmodSync(this.#privateKeyPath, 0o600);
    chmodSync(this.#webhookSecretPath, 0o600);
  }

  get #metadataPath(): string {
    return join(this.#directory, 'github-app.json');
  }

  get #privateKeyPath(): string {
    return join(this.#directory, 'github-app.pem');
  }

  get #webhookSecretPath(): string {
    return join(this.#directory, 'github-webhook-secret');
  }
}
