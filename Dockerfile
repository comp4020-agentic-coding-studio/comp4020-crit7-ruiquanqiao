# syntax = docker/dockerfile:1

# The image Fly builds and runs: install, build, then keep only the built
# server and its production dependencies.

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Astro"

WORKDIR /app
ENV NODE_ENV=production

ARG PNPM_VERSION=11.9.0
RUN npm install -g pnpm@$PNPM_VERSION

# --- build stage: install everything, build, then prune to prod deps -------
FROM base AS build

# toolchain for native modules (better-sqlite3), in case no prebuilt binary
# matches the image platform
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY . .
RUN pnpm run build
RUN pnpm prune --prod

# --- runtime stage: just the built server and its production deps ----------
FROM base

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
# the committed migrations, applied at boot (see src/lib/db.ts)
COPY --from=build /app/drizzle /app/drizzle
# the handbook snapshots, read from disk at boot rather than bundled: every
# course in four years is tens of megabytes (see src/lib/catalog.ts)
COPY --from=build /app/data /app/data

# The machine has 256MB. Left to itself V8 grew its young generation to 134MB,
# almost all of it empty, taking the server to ~280MB after loading the whole
# handbook. Capped, a warm boot sits at ~150MB and the first-boot rebuild of
# every course still completes under a 110MB old-space limit.
ENV NODE_OPTIONS="--max-semi-space-size=8 --max-old-space-size=160"
ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
