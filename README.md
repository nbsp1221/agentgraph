# AgentGraph

AgentGraph is an experimental, local-first control plane for running AI agent work loops to a verified terminal state.

The first vertical slice is intentionally narrow:

```text
pull request event
  -> isolated Codex review
  -> validated findings
  -> GitHub review
```

Code review is the first experiment, not the product boundary. The longer-term goal is to coordinate agents and humans across execution, verification, retry, and handoff steps until work is done, failed, cancelled, or needs a person.

## Project status

The first private-repository vertical loop is operational: a GitHub App webhook can create a durable job, run the configured reviewer inside a disposable Docker Sandbox, and publish a review as `retn0-assistant[bot]`. This remains an experimental single-operator MVP and is not ready for production repositories.

## Development

Requirements:

- Node.js 24 or newer
- pnpm 11
- Docker Engine and Docker Sandboxes (`sbx`)

Install and validate the current skeleton:

```sh
corepack pnpm install
corepack pnpm check
```

Run the development CLI:

```sh
corepack pnpm dev -- --help
```

## Configuration

Copy the public example and set the GitHub account ID and callback URL for your installation:

```sh
cp .env.example .env
```

Runtime state, GitHub App credentials, and review artifacts live under the ignored `.agentgraph/` directory by default. Environment variables are grouped by responsibility rather than product name: `APP_*` controls the process, `GITHUB_*` controls the integration, and `REVIEW_*` controls review execution.

The quality-first review defaults are `gpt-5.6-sol` with `high` reasoning. Model capacity or execution failures are reported as failed review jobs; AgentGraph does not silently switch to another model.

Tests are separated by execution boundary:

- `tests/unit` contains deterministic policy and transformation tests.
- `tests/integration` exercises SQLite, files, HTTP, and process boundaries.
- `tests/e2e` launches the executable entry point as an external process.

Each group has a matching `test:unit`, `test:integration`, or `test:e2e` script for CI.

## Architecture

Source modules are grouped by the responsibility that changes them:

```text
src/
├─ cli.ts       composition root and executable entry point
├─ app/         configuration and HTTP server
├─ github/      GitHub App credentials, API, manifest, and webhooks
├─ jobs/        durable state, commands, and review orchestration
├─ review/      review policy, results, history, and publication rules
├─ sandbox/     disposable Codex execution and recovery
└─ system/      operating-system process boundary
```

Imports remain explicit rather than using barrel exports. The `review` modules do not depend on job storage or the GitHub client; adapters consume their contracts instead.

## Deployment

The deployment boundary is:

```text
GitHub
  -> optional reverse proxy or tunnel
  -> AgentGraph container
  -> host sandboxd Unix socket
  -> disposable Codex Docker Sandbox
```

Docker Compose provides a reproducible AgentGraph process, health reporting, and restart policy. The trusted host `sandboxd` daemon remains the execution bridge because it owns Docker Sandbox lifecycle and operator-managed Codex OAuth. The AgentGraph container does not receive the host Docker socket.

Validate and start the service:

```sh
docker compose config --quiet
docker compose build reviewer web
docker compose up -d
docker compose ps
```

Compose runs two independently healthy services: the reviewer listens on internal port `6571`, and the Next.js web app listens on internal port `6572`. The default host bindings are loopback-only (`REVIEWER_PORT=6571` and `WEB_PORT=6572`); set the corresponding `*_BIND_ADDRESS` values only when the deployment boundary requires it. The web service is intentionally not blocked on reviewer health, so it can show its degraded backend state while the reviewer recovers.

Runtime state stays with the checkout in `.agentgraph/`; no root-owned directory or system-wide application path is required. Only the reviewer mounts the data directory, sandbox CLI/configuration, and sandbox daemon state. The data directory is mounted at the same absolute path because the host `sandboxd` daemon must be able to resolve per-job anchor and resource paths created by the reviewer container. The web container receives no GitHub credentials, sandbox mounts, or data volume. Private repository contents are still cloned only inside the disposable Sandbox.

This MVP intentionally has no application-level authentication. Deploy the site only behind an operator-controlled private network such as Tailscale; anyone who can reach the site can read review artifacts and change evaluations. Within that trusted boundary, same-origin Caddy routing should send API and webhook paths to the reviewer and all other paths to the web service:

```caddy
github-assistant.example.com {
    @reviewer path /api/* /healthz /webhooks/github /setup/github*
    handle @reviewer {
        reverse_proxy reviewer:6571
    }

    handle {
        reverse_proxy web:6572
    }
}
```

The repository does not modify or reload an operating Caddy configuration. For local testing, the ignored `compose.override.yaml` connects both services to the existing external `caddy-network`; verify that network and the current Caddy aliases before use. Keep any host-specific Caddy file outside this repository or in an ignored local deployment directory.

Before changing an operating Caddy route, save a backup, run `caddy validate --config <config>`, and inspect the rendered route priority. After explicit approval, use a graceful reload and smoke test both `https://<host>/en/reviews` and same-origin `/api/v1/status`; also verify an existing virtual host before and after the reload. Do not stop the Caddy container or reload unrelated virtual hosts. The sandbox daemon directory is mounted read-only rather than binding only the socket file, so a daemon restart can replace the socket without leaving the reviewer attached to a stale inode. Starting and supervising the host `sandboxd` process is an infrastructure prerequisite and is intentionally outside AgentGraph's deployment scope.

## License

[MIT](LICENSE)
