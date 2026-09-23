# Third-Party Updates

> These checks are maintenance guidance, not evidence that a complete release
> workflow or production deployment has been exercised.

Third-party updates are code, security, compatibility, operational, and license
changes. A version bump is complete only when the exact shipped artifact and
its notices have been reviewed and tested.

## Inventory for every release

Record at least:

- source commit and release tag;
- npm lockfiles and production dependency inventory;
- container image names, immutable tags, and digests;
- operating-system base image and installed packages;
- FFmpeg binary version, build configuration, and linked libraries;
- Chromium package version and package notices;
- yt-dlp version, source URL, and checksum;
- vendored WeatherStar 4000+ commit and retained license;
- PostgreSQL, Valkey, MinIO, and Caddy versions;
- Expo, React Native, Roku source, and local build-tool versions; and
- any optional GPU runtime, driver floor, and codec capabilities.

Keep the inventory with release evidence. A lockfile is useful for
reproducibility but is not by itself a software bill of materials or a complete
license notice bundle.

## Update process

1. Read upstream security advisories, release notes, migration notes, and
   support windows.
2. Verify the download source, signature or digest when available, and
   checksum.
3. Review license files, copyright notices, dependencies, build flags, and
   service terms for changes.
4. Update one component family at a time and preserve immutable pins.
5. Rebuild from a clean dependency state.
6. Run static checks, unit tests, integration tests, and representative media
   tests.
7. Exercise a fresh install, backup, restore, upgrade, and rollback in an
   isolated environment.
8. Update `THIRD_PARTY_NOTICES.md`, operational documentation, and the
   changelog when facts or obligations change.
9. Keep optional features disabled until their specific tests pass.

Candidate repository checks include:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

These commands are unverified as a complete v0.1 gate. Run the corresponding
local mobile and Roku checks when their source or shared contracts change.

## npm dependencies

Update from committed manifests and regenerate each affected lockfile with the
project's selected npm version. Review direct and transitive changes, install
scripts, native binaries, supported Node.js versions, and production bundle
impact.

Generate a license inventory from the exact installed tree. Package metadata
can be absent or wrong, so inspect source license files for missing, ambiguous,
custom, or copyleft entries. Include required texts and notices in distributed
artifacts. Do not describe the entire npm tree as MIT merely because the
StreamTumi application is MIT licensed.

Security audit output is a triage input, not proof that an artifact is safe.
Determine whether the vulnerable path is installed, shipped, reachable, and
fixed without introducing an incompatible change.

## WeatherStar 4000+

The optional weather profile currently vendors WeatherStar 4000+ commit
`7ec5f34e78047b445091111d74f53de267319283` and builds it with
`third_party/ws4kp/Dockerfile.server`. For an update:

- record the old and new upstream commits;
- compare source, build inputs, browser requests, data providers, and license
  notices;
- retain Matt Walsh's MIT notice in `docs/ws4kp-license.txt` and with the
  vendored source;
- rebuild rather than substituting an unreviewed mutable image;
- retest public NOAA-related egress and any operator allowlist;
- test resource limits, renderer cleanup, and failure behavior; and
- keep the profile disabled until review is complete.

Do not imply affiliation with weather-data providers or trademark owners.

## yt-dlp

Keep YouTube import disabled by default. Pin yt-dlp to an exact release and
verify its artifact checksum before changing the pin. Confirm the exact
artifact's Unlicense notice and review its runtime requirements.

Test metadata-only failure, duration and size limits, timeouts, cancellation,
temporary-file cleanup, hostile filenames, and an authorized download. Review
platform terms separately from the software license.

## FFmpeg

FFmpeg licensing depends on compile options and linked libraries. Capture
`ffmpeg -version` and `ffmpeg -buildconf` from the shipped runtime, inspect
package copyright files, and determine whether that exact build is LGPL or GPL
and what source or relinking obligations apply. Repeat the review whenever the
base image, FFmpeg package, codec libraries, or GPU support changes.

Test probes, CPU transcodes, stream copy, malformed inputs, cancellation,
resource limits, and all output contracts. Test optional GPU output separately;
matching codec names do not guarantee matching behavior.

## Chromium

Update Chromium with the weather-renderer image and preserve its multi-license
notices. Test sandbox and container restrictions, shared-memory limits, fonts,
audio capture, page startup, network egress, process cleanup, and security
updates. A browser version change can alter rendering even when application
code is unchanged.

## Data services

For PostgreSQL, distinguish patch updates from major upgrades and use an
upstream-supported data migration path. Test extensions, dump/restore, query
plans, collation behavior, and rollback limitations.

For Valkey, review persistence and replication format compatibility, command
changes, memory policy, client compatibility, and queue-library support. Do not
replace it with another cache image without an explicit architecture decision
and license review.

For MinIO, review upgrade order, data-format notes, S3 behavior, encryption,
client compatibility, and AGPL-3.0 obligations for the exact server release.
Keep MinIO an independently running private service and retain upstream
notices.

## Caddy

Pin the exact Caddy image or binary and identify compiled modules. The upstream
core uses Apache-2.0, but added modules may have other licenses. Test automatic
certificate issuance and renewal, redirects, headers, private-response caching,
large uploads, range requests, streaming, and log redaction.

## Mobile and Roku

The repository retains Expo/React Native and Roku source for local builds.
Review generated native dependencies, Apple/Android SDK terms, Roku platform
terms, package licenses, API compatibility, and device support floors. Hosted
build, publication, identity, telemetry, or device-integration services are
architecture changes and require separate review rather than an incidental
dependency update.

## Release gate

Do not publish an update until:

- exact versions and digests are recorded;
- license and notice changes are resolved;
- vulnerability review is documented;
- CPU operation passes without a GPU;
- optional GPU, weather, and YouTube paths remain opt-in;
- backup and restore have been exercised;
- public ingress remains limited to Caddy; and
- release notes identify migrations, configuration changes, and known risks.
