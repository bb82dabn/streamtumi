# Architecture

This document describes the standalone topology defined by the checked-in
Compose files. It does not establish production capacity or high availability;
operators must validate those properties for their workloads.

## Goals

StreamTumi is an MIT-licensed, self-hosted application for operating and
viewing scheduled media channels. It is designed for a single host, keeps
durable data under the operator's control, and uses local password
authentication.

The base deployment is CPU-first. GPU acceleration is optional. Optional
features fail closed: Compose profiles do not start unless selected, and
YouTube import remains disabled unless explicitly enabled.

## Components

```text
Browser / locally built mobile app / locally packaged Roku channel
                              |
                        HTTPS on 443
                              |
                     Caddy (proxy profile)
                              |
                       StreamTumi app
                     /        |        \
             PostgreSQL     Valkey     MinIO
                              |
                  core and profile workers
                              |
                           FFmpeg

Startup gate:
PostgreSQL + Valkey + MinIO -> one-shot migration -> app -> core worker

Optional weather profile:
StreamTumi -> weather renderer -> Chromium -> vendored WeatherStar 4000+
                                      |                  |
                                    FFmpeg       public weather data

Optional YouTube import:
StreamTumi worker -> yt-dlp -> operator-authorized media source
```

### Core Compose services

The unprofiled `compose.yaml` services are `postgres`, `valkey`, `minio`,
`migrate`, `app`, and `worker`. The one-shot migration must finish successfully
before the app starts. The base worker defaults to CPU transcoding.

PostgreSQL is the authoritative store for users, sessions, configuration,
schedules, and media metadata. MinIO is the S3-compatible store for uploaded
and generated objects. These two systems form the essential durable backup set.

Valkey provides queues, cache, leases, and short-lived coordination. It is not
the authoritative store for accounts or media metadata, but deleting its state
casually can lose queued work or disrupt active playout.

The app serves the web UI and API, handles local passwords and sessions,
authorizes access, and coordinates work. Workers inspect, prepare, transcode,
and play out media with FFmpeg. Application and worker ports are private.

### Optional profiles

| Profile | Services and responsibility |
| --- | --- |
| `media` | `media-worker` for media processing |
| `radio` | `radio-worker` and `radio-playout` |
| `tv` | `media-worker` and `tv-playout` |
| `weather` | `ws4kp` and `weather-renderer` |
| `proxy` | Caddy for public TLS and reverse proxying |

Profiles can be combined. The `tv` profile also selects `media-worker`.

### Public proxy

Caddy is the only intended public server component. The normal ingress surface
is TCP 80 for certificate issuance or HTTPS redirection and TCP/UDP 443 for
HTTPS and HTTP/3. The app binds to host loopback by default. PostgreSQL, Valkey,
MinIO, workers, playout services, and weather services remain private.

### GPU override

`compose.gpu.yaml` grants NVIDIA GPUs to the core worker and changes its
acceleration default to automatic detection unless `.env` explicitly sets a
different value. CPU remains the default when the override is absent.

GPU output still has to satisfy the same media contract. The worker probes
NVENC and can fall back to CPU, but operators must test driver, runtime, FFmpeg,
codec, performance, and fallback behavior on the production host.

### Local clients

The repository contains Expo/React Native mobile source and Roku source for
local generation, signing, packaging, and installation. Both clients use the
public HTTPS API. Signing identities, platform accounts, device installation,
and store submission are operator responsibilities.

The checked-in Roku manifest deliberately uses
`api_origin=https://streamtumi.invalid`. The operator must replace that value
with the deployment's canonical HTTPS origin before packaging; the placeholder
cannot reach a StreamTumi server.

## Trust boundaries

- Users authenticate with locally stored password credentials.
- Password hashing, session issuance, authorization, and revocation occur in
  the application boundary.
- Caddy terminates public TLS and forwards application traffic.
- PostgreSQL, Valkey, and MinIO trust only the private service network and
  independently generated credentials.
- Workers are trusted application components with media and queue access. They
  do not accept public ingress.
- Uploaded and imported media is untrusted input. Inspection and transcoding
  do not establish that it is safe or lawfully usable.
- Browser-driven weather rendering consumes untrusted public network content
  in an optional service.
- Mobile and Roku packages are inspectable and must not contain server secrets
  or administrator credentials.

Deployment secrets are supplied through the operator's private environment
configuration. Do not reuse application, database, object-store, SMTP, or
signing credentials.

## WeatherStar profile

WeatherStar 4000+ is vendored at commit
`7ec5f34e78047b445091111d74f53de267319283` under `third_party/ws4kp` and is
built by that directory's `Dockerfile.server`. The weather renderer uses
Chromium, Xvfb, and FFmpeg and can consume substantial CPU, memory, shared
memory, and temporary disk for each active location.

Weather rendering makes outbound requests to the public data sources used by
that exact WeatherStar revision, including NOAA-related services. Upstream
endpoints can change. Operators with egress allowlists must inspect observed
requests and revalidate them after every update rather than relying on a fixed
domain list.

Weather output is informational, is limited by upstream US-focused behavior,
and must not be used for life-safety decisions.

## YouTube import

The application image includes a pinned, checksummed `yt-dlp` for an optional
import path. `YOUTUBE_IMPORT_ENABLED` is `false` by default. Enabling it expands
the network, legal, storage, and media-input threat surfaces. Operators are
responsible for source terms and permission to download and rebroadcast each
item.

## Availability and durability

The topology is single-host, not highly available. Additional workers may
increase throughput where queue and lease semantics allow it, but must not
create multiple uncontrolled playout owners. PostgreSQL and MinIO capacity,
network bandwidth, media duration, transcode settings, and renderer concurrency
usually constrain the system before web request throughput.

PostgreSQL and MinIO must be backed up as a consistent set. Deployment secrets
and configuration are required to use that set. Valkey state is operationally
important but must not be the only copy of durable facts. See
`backup-restore.md`.
