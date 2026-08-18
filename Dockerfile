FROM node:24.13.0-bookworm@sha256:1de022d8459f896fff2e7b865823699dc7a8d5567507e8b87b14a7442e07f206 AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY resources ./resources
COPY src ./src
COPY tsconfig.json tsdown.config.ts ./
RUN pnpm build && pnpm prune --prod

FROM node:24.13.0-bookworm@sha256:1de022d8459f896fff2e7b865823699dc7a8d5567507e8b87b14a7442e07f206 AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/resources ./resources

USER node
EXPOSE 6571

CMD ["node", "dist/cli.js", "serve"]
