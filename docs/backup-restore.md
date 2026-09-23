# Backup and Restore

> The service names below match the current `compose.yaml`. The commands have
> not been exercised against operator data. Test a complete backup and restore
> on the exact release you operate before depending on this procedure.

## What must be protected

A usable StreamTumi recovery set contains:

- a PostgreSQL dump with users, sessions, application configuration, schedules,
  media metadata, and migration state;
- a matching MinIO copy containing uploaded and generated objects;
- the deployment configuration and the exact release identifier;
- application, PostgreSQL, and MinIO secrets needed to read the data; and
- any locally maintained Caddy configuration.

Valkey stores caches, queues, leases, and short-lived coordination data. Its
persistence can help operational recovery, but it must not replace PostgreSQL
or MinIO backups. Caddy certificate state can be backed up to reduce recovery
time, but certificates can normally be reissued if DNS and account limits
allow it.

Store backup data and decryption keys separately. A backup containing account
records, private media, URLs, or secrets is sensitive even if the host was not
publicly accessible.

## Consistency model

PostgreSQL rows can refer to MinIO objects while jobs are creating, replacing,
or deleting them. A database dump and object copy made during active writes
may therefore disagree.

The simplest v0.1 procedure is a planned, quiesced backup:

1. Prevent new uploads, imports, schedule edits, and account changes.
2. Stop application and worker services while leaving PostgreSQL and MinIO
   available to the backup tools.
3. Wait for active writes to finish or fail in a known state.
4. Create the PostgreSQL dump.
5. Copy all MinIO buckets and version metadata used by the deployment.
6. Optionally capture Valkey persistence after queues are quiescent.
7. Record checksums, release version, migration version, UTC time, and backup
   tool versions.
8. Restart services and verify health.

For lower downtime, use storage snapshots or database/object workflows that
provide a tested shared consistency point. Merely copying live Docker volume
directories is not a consistent backup method.

## Candidate PostgreSQL backup

The following custom-format dump uses the database values inside the current
`postgres` service:

```sh
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > postgres.dump
```

Check that the command exited successfully, that `postgres.dump` is non-empty,
and that `pg_restore --list postgres.dump` can read it. Capture global objects
separately if the release relies on roles or grants not created by deployment
automation. Do not put a password directly on a command line recorded in shell
history.

Use a PostgreSQL client version compatible with the server version. A logical
dump is usually more portable across upgrades than a raw volume copy.

## Candidate MinIO backup

Use a pinned, trusted MinIO Client (`mc`) or compatible S3 tool to copy every
application bucket to dedicated backup storage. An illustrative command shape
is:

```sh
mc mirror --overwrite --preserve source-alias/streamtumi backup-alias/streamtumi
```

This command is unverified. Bucket names, aliases, version behavior, delete
handling, object locking, encryption keys, and metadata requirements vary.
Confirm that the selected options preserve everything needed by the release.
Use checksums or an independent inventory to detect missing and truncated
objects.

Do not expose the MinIO API or console publicly just to perform a backup. Run
the tool on the private service network or through a controlled administrative
path.

## Configuration and secrets

Back up the effective non-secret configuration, the exact release tag or
commit, Compose files, environment variable names, and image digests. Back up
secret values in an encrypted secret manager or encrypted archive, not in the
source repository.

If an application encryption or signing secret is lost, database and object
copies may not be sufficient to restore sessions, tokens, or encrypted values.
Document secret rotation separately from backup rotation.

## Restore procedure

Restore into an isolated host or network first. Do not point a test restore at
production object storage, DNS, email delivery, or public clients.

1. Provision the same StreamTumi release, or a release whose notes explicitly
   support restoring that backup version.
2. Restore deployment secrets and private networking.
3. Start empty PostgreSQL, Valkey, and MinIO services only.
4. Recreate the expected database, role, bucket, and access policy.
5. Restore the PostgreSQL dump without starting application workers.
6. Restore all MinIO objects and metadata.
7. Start the application with background workers still stopped.
8. Apply migrations only if the selected release requires and supports them.
9. Validate database-to-object references and perform read-only playback tests.
10. Start one worker class at a time and watch for unexpected deletion,
    backfill, or duplicate processing.
11. Enable public routing only after validation succeeds.

An illustrative PostgreSQL restore command is:

```sh
docker compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < postgres.dump
```

This command is unverified and destructive to objects in the destination
database. Use it only against the intended empty or disposable restore target.
Depending on ownership and extension settings, different `pg_restore` options
may be required.

Start Valkey empty unless a release-specific recovery plan requires its saved
state. Old leases and in-flight queue entries can be unsafe after a long
outage. Let the application rebuild caches and reconcile durable jobs from
PostgreSQL where supported.

## Restore validation

Verify at least:

- local authentication and authorization;
- expected users, channels, schedules, and settings;
- object counts and representative checksums;
- playback of representative original and generated media;
- queue processing without a deletion or duplication storm;
- CPU transcoding;
- optional weather only if its profile was intentionally restored; and
- HTTPS behavior on a non-production hostname.

A backup is not proven until a restore has completed successfully. Schedule
restore tests and record recovery time and data loss against the deployment's
requirements.
