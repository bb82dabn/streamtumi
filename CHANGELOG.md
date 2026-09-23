# Changelog

All notable changes to StreamTumi will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project intends to use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) for public releases.

## [Unreleased]

### Added

- Public licensing, trademark, third-party notice, contribution, security,
  conduct, support, and operational documentation.
- GitHub issue and pull request templates for public collaboration.

### Changed

- The codebase is transitioning toward the standalone v0.1 architecture. Until
  that transition is complete, checked-in code and configuration may refer to
  components that are not part of the public target.

## [0.1.0] - Not yet released

### Target scope

- Standalone StreamTumi application under the MIT License.
- Local password authentication.
- PostgreSQL, Valkey, MinIO, Caddy, and FFmpeg service stack.
- CPU media processing by default, with optional GPU acceleration.
- Optional vendored WeatherStar 4000+ weather profile with public
  NOAA-related network egress.
- Optional YouTube import through yt-dlp, disabled by default.
- Expo/React Native mobile source and generic Roku source for local builds.

### Excluded from target

- SableID and Apple login.
- Red Devil and generic relay services.
- Live Studio, MediaMTX, and coturn.
- Cast, Sentry, and EAS.

No release date is assigned and the operational commands in the documentation
have not yet been validated against a final v0.1 release artifact.
