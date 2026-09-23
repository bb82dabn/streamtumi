# Self-Hosting

> The Compose command forms in this guide were checked against the current
> `compose.yaml` and `compose.gpu.yaml` with `docker compose config`. This is not
> a claim that the services were started or that a production deployment was
> tested. Validate the complete deployment on the host that will operate it.

## Deployment model

`compose.yaml` is CPU-first. Its unprofiled core consists of:

| Service | Purpose |
| --- | --- |
| `postgres` | Authoritative relational data |
| `valkey` | Queues, cache, leases, and coordination |
| `minio` | Uploaded and generated media objects |
| `migrate` | One-shot database migration before the app starts |
| `app` | Web application and API |
| `worker` | CPU media processing and background work |

The `migrate` service must complete successfully before `app` starts, and
`worker` waits for a healthy app. The app binds to `127.0.0.1:3000` by default,
and the MinIO console binds to `127.0.0.1:9001` by default.

Optional profiles add these services:

| Profile | Added services |
| --- | --- |
| `media` | `media-worker` |
| `radio` | `radio-worker`, `radio-playout` |
| `tv` | `media-worker`, `tv-playout` |
| `weather` | `ws4kp`, `weather-renderer` |
| `proxy` | `caddy` |

Profiles can be combined. Selecting `tv` already starts `media-worker`; it is
not necessary to also select `media` solely for TV processing.

## Prerequisites

- A 64-bit Linux host supported by the pinned container images.
- Docker Engine and Docker Compose v2.
- Sufficient storage for PostgreSQL, MinIO, temporary transcodes, logs, and
  backups.
- Working DNS and time synchronization for public HTTPS operation.
- Inbound TCP 80 and TCP/UDP 443 when using the `proxy` profile.
- A tested backup destination outside the deployment host.

Transcoding, playout, and weather rendering can be CPU-, memory-, and
I/O-intensive. Begin with the concurrency values in `.env.example`, measure the
host under representative media, and increase them deliberately.

## Configure the deployment

Check out an immutable release or commit, then create a private environment
file:

```sh
cp .env.example .env
chmod 600 .env
```

Replace every documented placeholder. At minimum, review:

- `APP_URL`, the canonical public origin, including `https://`;
- `APP_DOMAIN`, the hostname used by Caddy;
- `APP_SECRET`, with at least 48 random characters;
- `POSTGRES_PASSWORD` and `MINIO_ROOT_PASSWORD`;
- `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `S3_BUCKET`;
- `REGISTRATION_ENABLED`, which defaults to `false` in Compose;
- upload, retention, playout, and worker concurrency limits;
- optional SMTP and mobile association values; and
- `YOUTUBE_IMPORT_ENABLED`, which should remain `false` unless intentionally
  enabled.

The bundled defaults use the `streamtumi` PostgreSQL database, MinIO access
key, and object bucket. `DATABASE_URL`, `REDIS_URL`, and the S3 settings can be
changed for separately managed services, but the operator is then responsible
for networking, credentials, availability, and backup behavior.

Do not commit `.env`, database dumps, object-store copies, signing material, or
TLS private keys.

For a loopback-only evaluation, set:

```dotenv
APP_URL=http://localhost:3000
ALLOW_INSECURE_HTTP=true
APP_BIND_ADDRESS=127.0.0.1
```

Production requires an HTTPS `APP_URL`. Do not enable insecure HTTP for a
non-loopback deployment.

## Start the CPU deployment

Inspect the rendered model before starting it. Rendered output includes
sensitive environment values, so do not publish it.

```sh
docker compose config
docker compose up -d --build
docker compose ps
```

This starts the six core services. A successfully completed `migrate` container
is expected to show as exited rather than continuously running.

For public HTTPS through the bundled Caddy service, start the proxy profile:

```sh
docker compose --profile proxy config
docker compose --profile proxy up -d --build
docker compose --profile proxy ps
```

Keep the default loopback app binding when Caddy is the public entry point.
Only Caddy ports 80 and 443 should be reachable from the Internet.

## Create and recover the administrator

After migration succeeds, bootstrap the first active administrator from the
application image:

```sh
docker compose run --rm app npm run admin:bootstrap -- --email admin@example.com --display-name "StreamTumi Administrator"
```

The command refuses to create another account if an active administrator
already exists. It prints a generated temporary password, marks the email as
verified, and requires a password change after the first sign-in. Protect the
terminal output.

To reset an existing active administrator by email:

```sh
docker compose run --rm app npm run admin:reset-password -- --email admin@example.com
```

The reset command prints a new temporary password, requires it to be changed,
and revokes the administrator's web, mobile, and device sessions.

## Configure SMTP

Email delivery is disabled when `SMTP_HOST` is blank. Configure all applicable
values in `.env`:

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=streamtumi
SMTP_PASSWORD=replace-with-provider-password
EMAIL_FROM=StreamTumi <no-reply@example.com>
```

`EMAIL_FROM` is required when `SMTP_HOST` is set. `SMTP_USER` and
`SMTP_PASSWORD` must either both be set or both be blank. Use
`SMTP_SECURE=true` for a provider that expects TLS immediately on connection,
commonly on port 465; use the provider's documented settings rather than
assuming a port or TLS mode. Confirm registration verification and password
reset delivery before opening registration.

## Optional service profiles

Start only the workloads the deployment needs:

```sh
docker compose --profile media up -d --build
docker compose --profile radio up -d --build
docker compose --profile tv up -d --build
```

One command can select several profiles:

```sh
docker compose --profile radio --profile tv --profile proxy up -d --build
```

Re-run `docker compose` with the same selected profiles when inspecting or
updating that topology.

## Optional GPU acceleration

CPU transcoding is the default and needs no override. NVIDIA acceleration is
enabled by applying `compose.gpu.yaml` and setting
`TRANSCODE_ACCELERATION=auto` or `TRANSCODE_ACCELERATION=nvenc` in `.env`:

```sh
docker compose -f compose.yaml -f compose.gpu.yaml --profile proxy config
docker compose -f compose.yaml -f compose.gpu.yaml --profile proxy up -d --build
```

The override grants all NVIDIA GPUs to the core `worker`. It requires a working
host driver, NVIDIA container runtime, and compatible FFmpeg encoder. Test a
representative encode and retain the CPU-only command as a recovery path. Use
the same two-file form for later `config`, `up`, `ps`, and `logs` operations on
the GPU deployment.

## Optional weather profile

The `weather` profile builds WeatherStar 4000+ from the source vendored at
`third_party/ws4kp`, commit
`7ec5f34e78047b445091111d74f53de267319283`, using its
`Dockerfile.server`. Start it with:

```sh
docker compose --profile weather up -d --build
```

Weather rendering uses Chromium, Xvfb, and FFmpeg and may consume substantial
CPU, memory, shared memory, and temporary disk. The WeatherStar page makes
outbound requests to public weather data providers, including NOAA-related
services. Operators with egress controls must observe and review the requests
made by this exact vendored revision and revalidate them after an update.

Keep `ws4kp` and `weather-renderer` private. Weather output is informational;
use official sources for watches, warnings, and emergency decisions.

## Optional YouTube import

The application image includes a pinned, checksummed `yt-dlp`, but
`YOUTUBE_IMPORT_ENABLED=false` disables the import feature by default. Before
enabling it, review YouTube terms, source rights, download and metadata
timeouts, storage limits, and network egress. YouTube and its media-delivery
hosts may change, making a fixed egress allowlist impractical. The operator is
responsible for ensuring that each item may be downloaded and rebroadcast.

## Local clients

The mobile application is generated and built locally from `apps/mobile`; see
`mobile-release.md` and `apps/mobile/README.md`.

The Roku source is also packaged locally. Before any package or deployment,
replace the placeholder below in `roku/manifest` with the deployment's
canonical HTTPS origin:

```text
api_origin=https://streamtumi.invalid
```

Leaving `streamtumi.invalid` in place produces a client that cannot reach the
deployment. The local script shapes are:

```sh
npm ci
npm run roku:check
npm run roku:package
```

`npm run roku:deploy` additionally requires `ROKU_DEV_TARGET` and
`ROKU_DEV_PASSWORD` for a developer-mode device. No Roku package is published
or hosted by the server deployment.

## Validate the deployment

After the selected services are running, check their state and the public
health endpoint:

```sh
docker compose --profile proxy ps
curl --fail --show-error https://streamtumi.example.com/api/health
```

Also validate:

- a trusted certificate and HTTP-to-HTTPS redirect;
- no public PostgreSQL, Valkey, MinIO, app, or worker ports;
- administrator sign-in, forced temporary-password replacement, and sign-out;
- SMTP-backed verification and password reset if SMTP is configured;
- a small authorized upload and CPU processing job;
- the selected radio, TV, weather, or GPU paths independently;
- persistence across a normal restart; and
- a restore into an isolated environment.

Use `backup-restore.md` before maintenance, `external-access.md` for firewall and
egress policy, and `upgrading.md` for release changes.
