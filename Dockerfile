FROM node:24.13.0-bookworm@sha256:1de022d8459f896fff2e7b865823699dc7a8d5567507e8b87b14a7442e07f206 AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/reviewer/package.json apps/reviewer/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

COPY apps/reviewer ./apps/reviewer
COPY packages ./packages
RUN pnpm --filter @agentgraph/reviewer build \
  && pnpm --filter @agentgraph/reviewer deploy --prod /app/reviewer-runtime

FROM node:24.13.0-bookworm@sha256:1de022d8459f896fff2e7b865823699dc7a8d5567507e8b87b14a7442e07f206 AS runtime

ENV NODE_ENV=production
WORKDIR /app/apps/reviewer

COPY --from=build --chown=node:node /app/reviewer-runtime/ ./

USER node
EXPOSE 6571

CMD ["node", "dist/cli.js", "serve"]
