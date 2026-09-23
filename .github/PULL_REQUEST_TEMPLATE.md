## Summary

Describe the problem, the solution, and why this is the smallest appropriate
change.

## Public behavior

Describe user-visible and API behavior. State `None` if there is no public
behavior change.

## Operational impact

Describe configuration, migration, backup, restore, network, storage,
CPU/GPU, worker, and rollback effects. State `None` where appropriate.

## Third-party impact

List added or updated packages, images, binaries, vendored source, services,
data providers, assets, licenses, notices, platform terms, and trademarks.
State `None` if there is no third-party impact.

## Validation

List each command or manual check actually run and its result. Separately list
checks not run and why. Do not claim an unverified command works.

```text
Run:
-

Not run:
-
```

## Checklist

- [ ] The change is focused and follows `CONTRIBUTING.md`.
- [ ] The change targets local password authentication and does not add
      SableID or Apple login.
- [ ] The change does not add Red Devil, generic relays, live Studio,
      MediaMTX, coturn, Cast, Sentry, or EAS to the v0.1 target.
- [ ] CPU operation remains the default; GPU behavior is optional and tested
      separately when affected.
- [ ] Weather and YouTube behavior remains optional, with YouTube disabled by
      default.
- [ ] Tests cover behavior changes, or the validation section explains the
      gap.
- [ ] Documentation and `CHANGELOG.md` are updated when needed.
- [ ] Schema, configuration, backup, upgrade, and rollback effects are
      documented when needed.
- [ ] Third-party licenses and required notices were reviewed and retained.
- [ ] No credentials, personal data, unauthorized media, generated secrets,
      or private vulnerability details are included.
- [ ] Security-sensitive findings were reported privately under `SECURITY.md`.
