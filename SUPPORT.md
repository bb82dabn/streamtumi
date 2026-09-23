# Support

StreamTumi is a community-maintained, self-hosted project. Support is provided
on a best-effort basis with no guaranteed response or resolution time.

## Before requesting help

1. Confirm that the question concerns the v0.1 public target in
   `docs/architecture.md`.
2. Review `docs/self-hosting.md`, `docs/external-access.md`,
   `docs/backup-restore.md`, and `docs/upgrading.md`.
3. Search existing GitHub issues.
4. Remove secrets, access tokens, private URLs, personal data, and copyrighted
   media from logs and examples.

Use the GitHub bug report template for reproducible defects and the feature
request template for proposed changes. General installation questions may be
opened as a bug report if no discussion forum is available; select the support
or installation area and explain where the documentation was insufficient.

## Include with a support request

- the StreamTumi release or commit;
- host operating system, architecture, and container runtime versions;
- CPU mode or the exact optional GPU and driver stack;
- the affected service and relevant sanitized logs;
- expected and actual behavior; and
- minimal reproduction steps.

Do not post vulnerability details publicly. Follow `SECURITY.md` and use
GitHub private vulnerability reporting instead.

## Support boundaries

The v0.1 target covers the standalone app with local password authentication,
PostgreSQL, Valkey, MinIO, Caddy, FFmpeg, optional WeatherStar 4000+, optional
yt-dlp, and local mobile and Roku source builds.

Transition-era SableID, Apple login, Red Devil, generic relays, live Studio,
MediaMTX, coturn, Cast, Sentry, and EAS integrations are outside the public
support target. Maintainers also cannot provide individual legal advice,
recover lost operator secrets, administer third-party accounts, or guarantee
that imported media may lawfully be downloaded or rebroadcast.

Weather output is informational and must not be used for safety-critical
decisions. For official watches, warnings, and emergency guidance, use the
appropriate government and local-authority sources.
