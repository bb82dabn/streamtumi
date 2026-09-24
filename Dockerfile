FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG YT_DLP_VERSION=2026.07.04
ARG YT_DLP_SHA256=495be29ff4d9d4e9be7eabdfef225221e5d5282e77f2f505abc6dca80349f3fd
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl python3 \
    && curl --fail --location --output /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp" \
    && printf '%s  %s\n' "$YT_DLP_SHA256" /usr/local/bin/yt-dlp | sha256sum --check --strict \
    && chmod 0755 /usr/local/bin/yt-dlp \
    && yt-dlp --version \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV APP_SECRET=build-only-secret-must-be-at-least-32-characters \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    REDIS_URL=redis://localhost:6379 \
    S3_ENDPOINT=localhost \
    S3_ACCESS_KEY=build \
    S3_SECRET_KEY=build
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 10001 streamtumi \
    && useradd --system --uid 10001 --gid streamtumi --home-dir /app --shell /usr/sbin/nologin streamtumi \
    && install -d -o streamtumi -g streamtumi /app/.cache/fontconfig
COPY --chown=streamtumi:streamtumi --from=dependencies /app/node_modules ./node_modules
COPY --chown=streamtumi:streamtumi --from=builder /app/.next ./.next
COPY --chown=streamtumi:streamtumi --from=builder /app/public ./public
COPY --chown=streamtumi:streamtumi --from=builder /app/package.json /app/package-lock.json /app/tsconfig.json ./
COPY --chown=streamtumi:streamtumi --from=builder /app/lib ./lib
COPY --chown=streamtumi:streamtumi --from=builder /app/packages ./packages
COPY --chown=streamtumi:streamtumi --from=builder /app/scripts ./scripts
COPY --chown=streamtumi:streamtumi --from=builder /app/sql ./sql
COPY --chown=streamtumi:streamtumi --from=builder /app/src-worker.ts ./src-worker.ts
COPY --chown=streamtumi:streamtumi --from=builder /app/src-media-worker.ts ./src-media-worker.ts
COPY --chown=streamtumi:streamtumi --from=builder /app/src-radio-worker.ts ./src-radio-worker.ts
COPY --chown=streamtumi:streamtumi --from=builder /app/src-radio-playout.ts ./src-radio-playout.ts
COPY --chown=streamtumi:streamtumi --from=builder /app/src-tv-playout.ts ./src-tv-playout.ts
COPY --chown=streamtumi:streamtumi --from=builder /app/src-weather-renderer.ts ./src-weather-renderer.ts
USER streamtumi
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]

FROM runner AS chromium-runner
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium pulseaudio xvfb \
    && rm -rf /var/lib/apt/lists/*
USER streamtumi

FROM chromium-runner AS weather-runner

FROM runner AS default
