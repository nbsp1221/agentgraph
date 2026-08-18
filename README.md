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
docker compose config
docker compose build
docker compose up -d
docker compose ps
```

The service listens on the configurable loopback address and defaults to port `6571`. Runtime state stays with the checkout in `.agentgraph/`; no root-owned directory or system-wide application path is required. The data directory is mounted at the same absolute path because the host `sandboxd` daemon must be able to resolve per-job anchor and resource paths created by the container. Private repository contents are still cloned only inside the disposable Sandbox.

Reverse proxy and external Docker network settings are deployment-specific and belong in a local `compose.override.yaml`, not the public base configuration. The sandbox daemon directory is mounted read-only rather than binding only the socket file, so a daemon restart can replace the socket without leaving the container attached to a stale inode. The healthcheck verifies both the HTTP process and daemon availability. Starting and supervising the host `sandboxd` process is an infrastructure prerequisite and is intentionally outside AgentGraph's deployment scope.

## License

[MIT](LICENSE)
