# Third-Party Notices

StreamTumi's original application code is licensed under the MIT License in
`LICENSE`. StreamTumi also uses, invokes, builds with, or interoperates with
third-party software and services. Those components remain under their own
licenses and terms.

This file is a practical inventory, not a substitute for the notices shipped
by an exact source checkout, npm package, container image, operating-system
package, or binary. Versions and dependency graphs change. A distributor must
review the exact artifacts it ships and retain all required license texts,
copyright notices, source offers, and attributions. This file is not legal
advice.

## WeatherStar 4000+

The optional weather profile for the v0.1 target includes vendored source from
[WeatherStar 4000+](https://github.com/netbymatt/ws4kp), by Matt Walsh. The
project identifies that work as MIT licensed. The included upstream license
notice is retained in `third_party/ws4kp/LICENSE` and
`docs/ws4kp-license.txt`; it must remain with copies or substantial portions
of that code.

WeatherStar 4000+ is a fan project and uses public weather data sources,
including NOAA-related sources. Data-source access, attribution, acceptable
use, and availability are separate from the software license. Weather-related
output must not be relied on for safety-critical decisions. WeatherSTAR and
other third-party names and marks belong to their respective owners; no
affiliation or endorsement is claimed.

## yt-dlp

The optional YouTube import path invokes
[yt-dlp](https://github.com/yt-dlp/yt-dlp). Upstream distributes yt-dlp under
the Unlicense. Confirm the license and notices for the exact downloaded
artifact and any runtime components it uses.

YouTube import is disabled by default in the v0.1 target. A software license
does not grant rights to download, copy, or rebroadcast media and does not
replace YouTube's terms. Operators and users are responsible for having all
necessary rights and permissions.

## FFmpeg

StreamTumi invokes [FFmpeg](https://ffmpeg.org/) for media processing. FFmpeg
licensing is build-dependent: an FFmpeg build may be under the GNU Lesser
General Public License (LGPL), or under the GNU General Public License (GPL)
when GPL components or configuration options are enabled. Additional external
libraries can add their own terms.

Do not infer the license of an FFmpeg binary from this notice. Inspect the
exact binary, its build configuration, linked libraries, package copyright
files, and corresponding source obligations before distribution. The output
of `ffmpeg -version` and `ffmpeg -buildconf` can assist that review but is not
itself a complete compliance record.

## PostgreSQL

[PostgreSQL](https://www.postgresql.org/) is used as a separate database
service. PostgreSQL is distributed under the PostgreSQL License. Preserve the
license and copyright notices from the exact PostgreSQL image or package that
is redistributed.

## Valkey

[Valkey](https://valkey.io/) is the v0.1 target's separate cache and queue
service. Valkey is distributed under the BSD 3-Clause License. Preserve the
notices supplied with the exact Valkey release or image. StreamTumi uses
Valkey's Redis-compatible protocol and client ecosystem.

## MinIO

[MinIO](https://min.io/) server is used as a separate, independently running
S3-compatible object-storage service. Current MinIO server releases identify
the GNU Affero General Public License version 3 (AGPL-3.0) as their open-source
license. The MinIO client libraries may use different licenses.

Service separation does not waive any license obligation. Operators who
modify, convey, or provide network access to MinIO should review the license
and notices for the exact server and client versions they use, including any
corresponding-source requirement. StreamTumi does not relicense MinIO.

## Caddy

[Caddy](https://caddyserver.com/) is used as a separate reverse proxy and TLS
terminator. The upstream Caddy project is distributed under the Apache
License 2.0. Caddy builds can include third-party modules with additional
licenses. Review the module list and retain the notices for the exact image or
binary being redistributed.

## Chromium

The optional weather renderer drives Chromium. Chromium contains code under
multiple open-source licenses rather than one project-wide license. Debian or
other container packages normally include a package copyright file and
component notices. Preserve those materials and review the exact Chromium
package and bundled codecs before redistribution.

## Expo and React Native

The retained mobile source uses Expo, React, and React Native. Their core
upstream projects identify MIT licenses, but an Expo/React Native dependency
tree includes many separately licensed packages and platform SDKs. Native
builds can also incorporate Apple or Android SDK materials governed by their
own terms. Review generated native projects and all packaged artifacts; do not
apply the StreamTumi MIT License to third-party code.

The v0.1 target supports local mobile builds only. It does not require or
include EAS services, Sentry, Cast, or Apple login.

## Roku source and tooling

The repository retains generic Roku channel source. Use of Roku devices,
developer mode, platform APIs, documentation, packaging, and publication may
be governed by Roku's applicable developer and platform terms. Roku names and
marks are owned by their respective owners; no affiliation or endorsement is
claimed.

Development tools such as BrighterScript and roku-deploy are npm dependencies
and carry their own licenses and notices. Verify their package metadata and
included license files at the locked versions before redistribution. The v0.1
target provides source for local builds and does not promise a hosted Roku
release service.

## npm dependencies

The root application, mobile application, and shared packages use direct and
transitive npm dependencies. The applicable set is recorded by the relevant
`package.json` and lockfiles. Each package is governed by its own license;
there is no supported blanket license assertion for the complete dependency
tree.

Before publishing an artifact:

1. Install from the committed lockfile without changing dependency resolution.
2. Produce a license inventory from the installed production dependency tree.
3. Resolve missing, ambiguous, custom, copyleft, or incompatible metadata by
   reviewing the package source and included license files.
4. Include required notices and license texts in the distributed artifact.
5. Repeat the review for development tools if they are redistributed rather
   than used only to build the artifact.

Common top-level dependencies include Next.js, React, PostgreSQL and MinIO
clients, BullMQ, ioredis, Playwright, Sharp, Zod, Expo, React Native,
BrighterScript, and roku-deploy. This list is illustrative and is not an
exhaustive software bill of materials or a representation that all listed
projects use the same license.

## Hosted data and services

Public weather endpoints, YouTube, app stores, package registries, certificate
authorities, and device platforms may impose terms independent of software
copyright licenses. Operators must review those terms for their use case.
