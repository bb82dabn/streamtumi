# Contributing to StreamTumi

Thank you for helping improve StreamTumi.

## v0.1 scope

The repository is transitioning to the v0.1 public-release target described in
`docs/architecture.md`. Some checked-in code and configuration still mention
systems outside that target. New work should move toward the documented
standalone architecture rather than extend transition-only integrations.

The target uses local password authentication, PostgreSQL, Valkey, MinIO,
Caddy, and FFmpeg. WeatherStar 4000+ and YouTube import are optional. CPU media
processing is the default, with GPU acceleration as an explicit option.

SableID, Apple login, Red Devil, generic relays, live Studio, MediaMTX, coturn,
Cast, Sentry, and EAS are not in the v0.1 public target.

## Before opening a change

- Search existing issues and pull requests.
- Open an issue before a large architectural change or a new dependency.
- Report vulnerabilities privately as described in `SECURITY.md`, not in a
  public issue.
- Keep changes focused. Avoid unrelated formatting or generated artifacts.
- Do not commit credentials, personal data, copyrighted media, database dumps,
  signing keys, or production configuration.

## Development workflow

The following commands are candidate contributor checks inferred from the
repository scripts. They have not yet been verified as a complete v0.1 release
workflow:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Tests that require browsers, containers, media devices, a GPU, or external
services may need separate setup. Keep the CPU path working even when adding
optional acceleration. Do not make a test depend on YouTube or public weather
services when a deterministic local fixture can cover the behavior.

For mobile changes, use the local scripts under `apps/mobile`. For Roku
changes, use the checked-in generic Roku source and local tooling. Remote EAS,
Sentry, Cast, and hosted Roku release workflows are outside the v0.1 target.

## Pull requests

A pull request should:

- explain the problem and the chosen solution;
- identify user-visible, schema, configuration, and operational effects;
- include or update tests for behavior changes;
- update public documentation and the changelog when appropriate;
- identify new third-party code, assets, services, or data sources and their
  license implications;
- preserve upgrade and rollback safety; and
- state which checks were run and which were not.

Maintainers may ask for a change to be split, simplified, or aligned with the
v0.1 scope before review.

## Style

Follow the patterns in nearby code. Prefer small, explicit changes over new
abstraction without a demonstrated need. Comments should explain constraints
or non-obvious decisions rather than restate the code.

Use ASCII in source and documentation unless a file or user-facing requirement
needs other characters. Add migrations rather than silently changing persisted
data assumptions.

## Licensing

By submitting a contribution, you agree that your contribution may be
distributed under the project's MIT License and that you have the right to
submit it. Do not copy code, media, fonts, logos, or other material unless its
license is compatible and its required notices are included.

Contributing code does not grant rights to the StreamTumi name or logos. See
`TRADEMARKS.md`.

## Conduct

Participation is governed by `CODE_OF_CONDUCT.md`.
