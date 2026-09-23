# External Access

This guide reflects the current `compose.yaml` network and port bindings. It is
not evidence that a particular host firewall, DNS record, certificate, or
external route has been tested.

## Public boundary

Caddy, enabled by the `proxy` profile, is the only intended public ingress.

| Component | Public ingress | Intended exposure |
| --- | --- | --- |
| Caddy | TCP 80, TCP/UDP 443 | HTTP redirect, ACME, HTTPS, and HTTP/3 |
| StreamTumi app | No | Private container network and host loopback |
| PostgreSQL | No | Private service network |
| Valkey | No | Private service network |
| MinIO API | No | Private service network |
| MinIO console | No | Host loopback by default |
| Workers, playout, and FFmpeg | No | Private application boundary |
| WeatherStar and renderer | No | Optional private profile |

No additional media or client-facing ingress ports are part of the Compose
topology.

## DNS and TLS

Create DNS records for one canonical application hostname and point them to the
public host. If both IPv4 and IPv6 records exist, both paths must reach Caddy
and have equivalent firewall policy.

Set `APP_URL` to the exact external HTTPS origin and `APP_DOMAIN` to its
hostname. Forward public ports 80 and 443 to Caddy without exposing the app's
internal port. Caddy needs outbound access to its configured certificate
authority and requires working DNS and clock synchronization.

Avoid multiple proxies that independently rewrite scheme, host, or client
address headers unless their trust boundary is explicitly configured and
tested. A different proxy or certificate workflow is possible, but the final
origin must use a certificate trusted by browsers and local mobile and Roku
devices.

## Firewall baseline

- Allow inbound TCP 80 and TCP/UDP 443 to Caddy.
- Deny public ingress to the app, PostgreSQL, Valkey, MinIO, workers, playout,
  Chromium, and FFmpeg.
- Restrict SSH and host administration to a trusted network or VPN.
- Keep the MinIO console on loopback or a private administration network.
- Apply equivalent IPv4 and IPv6 policy.
- Confirm exposure from outside the host, not only from local socket listings.

HTTP/3 uses UDP 443 and is optional. If UDP 443 is blocked, HTTPS over TCP 443
should continue to work. Do not open a broad UDP range.

## Reverse proxy behavior

Long media responses can be affected by buffering, response timeouts, range
requests, and client disconnect handling. Use the checked-in `Caddyfile` as the
baseline. If another proxy or CDN is added, test login cookies, upload limits,
streaming, seeking, cache headers, private playback URLs, and redaction of
secret-bearing query values.

Never cache authenticated APIs or private media solely by URL without
understanding token and authorization semantics. Treat proxy logs as sensitive
because paths, query strings, addresses, and user agents can contain private
information.

## Outbound access

The core runtime may require outbound DNS, certificate-authority access, and
operator-configured SMTP. Building and updating also requires the selected
source, npm, operating-system package, and container registries.

SMTP destinations and ports are operator configured. Permit only the selected
provider and validate its TLS mode, credentials, sender policy, and delivery.

The optional weather profile makes HTTPS requests to the public data sources
used by the vendored WeatherStar 4000+ commit
`7ec5f34e78047b445091111d74f53de267319283`, including NOAA-related services.
Browser requests and upstream endpoints can change. Build an egress allowlist
from reviewed, observed requests for this exact revision and revalidate it
after updates. This document is not an exhaustive domain list.

The optional YouTube import path requires access to YouTube and media-delivery
hosts selected by `yt-dlp`. It is disabled by default. Enabling it can make a
fixed egress allowlist impractical and does not grant permission to download or
rebroadcast media.

PostgreSQL, Valkey, MinIO, workers, and weather services do not need
unsolicited inbound Internet access.

## Client access

Browsers, locally built Expo/React Native apps, and locally packaged Roku
channels use the same canonical HTTPS origin. Private certificate authorities
or self-signed certificates require trust installation on every client and may
not work on all devices.

Do not embed administrator credentials or long-lived application secrets in a
mobile or Roku package. Before Roku packaging, replace
`api_origin=https://streamtumi.invalid` in `roku/manifest` with the canonical
HTTPS origin.

## Validation

Run these only after the deployment is available; their presence here does not
claim a successful live check:

```sh
curl --fail --show-error --include https://streamtumi.example.com/api/health
docker compose --profile proxy ps
```

Test from an external IPv4 network and, when published, IPv6:

- certificate chain, hostname, and HTTP-to-HTTPS redirect;
- local sign-in and sign-out;
- registration, verification, and password reset when SMTP is enabled;
- upload limits and interrupted uploads;
- media start, seek, and sustained playback;
- mobile association documents and Roku API access;
- absence of public database, cache, MinIO, app, and worker ports; and
- optional feature egress only while that feature is enabled.
