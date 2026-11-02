# syntax=docker/dockerfile:1.7

# OpenCandle (with its bundled pi coding agent) packaged for local use.
# The OpenCandle version and all transitive dependencies are pinned by
# docker/app/package-lock.json. pi is NOT installed separately.

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

# ---------------------------------------------------------------- build ----
FROM ${NODE_IMAGE} AS build

# Toolchain for native modules (better-sqlite3) when no prebuilt binary fits.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/opencandle
COPY docker/app/package.json docker/app/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund \
 && node -e 'require("better-sqlite3")' \
 && test "$(find node_modules -type d -path '*@earendil-works/pi-coding-agent' | wc -l)" -eq 1

# -------------------------------------------------------------- runtime ----
FROM ${NODE_IMAGE} AS runtime

ARG APP_UID=1000
ARG APP_GID=1000

RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 # Reuse the base image's uid-1000 "node" account as "opencandle".
 && groupmod -o -g "${APP_GID}" -n opencandle node \
 && usermod -o -u "${APP_UID}" -g "${APP_GID}" -l opencandle -d /data/home node \
 && mkdir -p /data/opencandle /data/pi-agent /data/workspace /data/home \
 && chown -R "${APP_UID}:${APP_GID}" /data \
 && chmod 700 /data/opencandle /data/pi-agent /data/home

COPY --from=build /opt/opencandle /opt/opencandle
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/lib /opt/opencandle-docker/lib
COPY docker/presets /opt/opencandle-docker/presets

RUN ln -s /opt/opencandle/node_modules/opencandle/dist/cli.js /usr/local/bin/opencandle \
 && mkdir -p /usr/share/licenses/opencandle /usr/share/licenses/pi-coding-agent \
 && cp /opt/opencandle/node_modules/opencandle/LICENSE /usr/share/licenses/opencandle/ \
 && (cp /opt/opencandle/node_modules/@earendil-works/pi-coding-agent/LICENSE* /usr/share/licenses/pi-coding-agent/ 2>/dev/null \
     || node -e 'const p=require("/opt/opencandle/node_modules/@earendil-works/pi-coding-agent/package.json");console.log(p.name+"@"+p.version+" license: "+p.license)' \
        > /usr/share/licenses/pi-coding-agent/LICENSE.txt) \
 && chmod 755 /usr/local/bin/entrypoint.sh

ARG OPENCANDLE_VERSION=0.15.0
LABEL org.opencontainers.image.title="opencandle-local" \
      org.opencontainers.image.description="OpenCandle financial research agent with bundled pi, configured for a local LLM on the host" \
      org.opencontainers.image.source="https://github.com/Kahtaf/OpenCandle" \
      org.opencontainers.image.version="${OPENCANDLE_VERSION}" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    HOME=/data/home \
    OPENCANDLE_HOME=/data/opencandle \
    PI_CODING_AGENT_DIR=/data/pi-agent \
    OPENCANDLE_GUI_HOST=0.0.0.0 \
    OPENCANDLE_GUI_PORT=14567 \
    PI_SKIP_VERSION_CHECK=1

USER opencandle
WORKDIR /data/workspace
EXPOSE 14567

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "/opt/opencandle-docker/lib/healthcheck.mjs"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["gui"]
