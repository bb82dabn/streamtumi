# Upgrading

> These steps reflect the current single-host Compose topology. They have not
> been exercised as an end-to-end production upgrade or rollback. Release notes
> for the versions being installed take precedence.

## Before upgrading

1. Read the changelog and release notes for every skipped version.
2. Confirm host, database, object-store, container, CPU, and optional GPU
   requirements.
3. Review dependency and license changes described in
   `third-party-updates.md`.
4. Record the current source commit, image digests, effective configuration,
   selected Compose profiles, schema version, and client versions.
5. Make and test a consistent PostgreSQL and MinIO backup using
   `backup-restore.md`.
6. Ensure enough free disk for old and new images, database migration work,
   temporary transcodes, and rollback artifacts.
7. Schedule downtime unless the release notes explicitly establish a safe
   online-upgrade path.

Do not combine application, PostgreSQL major-version, MinIO, Valkey, and host
upgrades unless the release procedure requires it. Smaller steps are easier to
diagnose and reverse.

## Single-host procedure

1. Disable registration, uploads, imports, and programming changes.
2. Drain active processing where possible, then stop profile workers and
   playout services.
3. Fetch and authenticate the desired immutable release.
4. Compare `.env.example` with the deployment's `.env` without overwriting
   secrets.
5. Render the selected Compose topology and review every change.
6. Build and pull the release's pinned dependencies.
7. Start the deployment with its selected profiles.
8. Confirm that the one-shot `migrate` service completed successfully.
9. Validate the app and core worker before re-enabling optional workloads.
10. Re-enable writes and optional features only after their checks pass.

For a core CPU deployment, the checked-in command shape is:

```sh
git fetch --tags
git checkout <release-tag>
docker compose config
docker compose build --pull
docker compose up -d
docker compose ps --all
```

Add the deployment's profiles consistently. For example:

```sh
docker compose --profile radio --profile tv --profile proxy config
docker compose --profile radio --profile tv --profile proxy up -d --build
docker compose --profile radio --profile tv --profile proxy ps --all
```

GPU deployments must use both Compose files for every render and update:

```sh
docker compose -f compose.yaml -f compose.gpu.yaml --profile proxy config
docker compose -f compose.yaml -f compose.gpu.yaml --profile proxy up -d --build
```

Replace `<release-tag>` with an authenticated release reference. The command
forms were checked against the current Compose files, but no live upgrade was
performed for this documentation update. Never use `docker compose down -v`
during a normal upgrade because it removes named data volumes.

## Migrations

`compose.yaml` defines `migrate` as a one-shot `npm run db:migrate` service.
PostgreSQL, Valkey, and MinIO must be healthy before it runs; the app starts
only after it exits successfully. Do not launch a second manual migration in
parallel.

Database migrations can be irreversible. A successful migration does not mean
an older application can use the new schema. Treat rollback as a complete data
restore unless release notes explicitly guarantee backward compatibility.

## Configuration changes

Compare environment templates line by line and classify each setting as
required, optional, removed, or renamed. Do not replace the deployment file
wholesale. Preserve independently generated secrets unless a release requires
rotation and documents the order.

Retain these safe defaults unless the operator deliberately changes them:

- local password authentication;
- CPU transcoding unless the GPU override is selected;
- `YOUTUBE_IMPORT_ENABLED=false`;
- the weather profile stopped unless selected; and
- only Caddy exposed publicly.

When enabling SMTP, require `EMAIL_FROM` with `SMTP_HOST`, and configure
`SMTP_USER` and `SMTP_PASSWORD` together or leave both blank.

## Data services

For PostgreSQL major upgrades, use a supported logical dump/restore,
`pg_upgrade`, or another upstream procedure. Do not point a new major image at
an old data directory without confirming compatibility.

Review Valkey persistence-format and command compatibility before a major
change. Review MinIO release notes, data-format changes, encryption behavior,
client compatibility, and license obligations. Verify object reads and writes
before restarting all workers.

## Optional components

Update the weather profile as one unit: vendored WeatherStar source,
`Dockerfile.server`, Chromium, renderer code, FFmpeg, fonts, and public data
egress. Keep it stopped while validating the core upgrade. Re-observe the
public weather requests made by the updated source, including NOAA-related
requests, before updating an egress allowlist.

Update `yt-dlp` deliberately and retain version and checksum evidence. Keep
YouTube import disabled until metadata and download behavior has been tested
with authorized content and current platform terms have been reviewed.

For GPU deployments, verify host driver and container runtime compatibility.
Test the CPU path first and a representative GPU encode second.

Mobile and Roku source is built locally. Test supported locally signed client
versions against the upgraded API before distribution. The Roku operator must
replace `api_origin=https://streamtumi.invalid` before packaging.

## Validation

After the upgrade, check:

- service health, migration completion, and restart loops;
- local sign-in, sign-out, authorization, and administrator recovery;
- SMTP verification and password reset if configured;
- object upload, read, and deletion behavior;
- queue depth and failed or duplicated jobs;
- representative CPU transcodes and playback;
- selected radio, TV, weather, and GPU paths;
- HTTPS certificates, canonical URLs, and external port exposure;
- disk, memory, and temporary-storage pressure; and
- a backup after the new version is stable.

## Rollback

Stop the failed release before rollback. If no schema or durable-data change
occurred and release notes permit it, redeploy the recorded prior images and
configuration. Otherwise, restore the complete pre-upgrade PostgreSQL and
MinIO consistency set into an isolated environment, validate it, and then
replace production.

Do not combine a new database with an old application merely because it starts.
Do not restore only PostgreSQL when objects also changed. Preserve sanitized
failed-upgrade logs and metadata for diagnosis.
