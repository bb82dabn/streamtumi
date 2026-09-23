# WeatherStar 4000+ Upstream

This directory is a source import of WeatherStar 4000+.

- Upstream: https://github.com/netbymatt/ws4kp
- Version declared by upstream: 7.1.6
- Commit: `7ec5f34e78047b445091111d74f53de267319283`
- Imported: 2026-09-23
- License: MIT, preserved in `LICENSE`

The commit is reported as verified by GitHub. Local `git verify-commit` also
requires GitHub's web-flow public signing key, which is not bundled here.

StreamTumi builds this source locally with `Dockerfile.server`. Keep
StreamTumi-specific integration in the parent project and document every
unavoidable vendor patch in this file.

## StreamTumi patches

- `package-lock.json`: refreshed with `npm audit fix` on 2026-09-23. This only
  updates dependencies within upstream-compatible declared ranges and resolves
  the high-severity `brace-expansion`, `fast-uri`, and `js-yaml` advisories plus
  the moderate `qs` advisory present in the imported lockfile.
- Removed four trailing-whitespace occurrences so the public Git tree passes
  `git diff --check`; no executable behavior changed.

Before updating:

1. Review upstream changes and dependency licenses.
2. Verify the selected commit through GitHub and with a trusted local key.
3. Replace this directory from `git archive <commit>`.
4. Preserve upstream `LICENSE`, attribution, and disclaimers.
5. Run the WeatherStar build, lint, renderer, and live-data smoke checks.
