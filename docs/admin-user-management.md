# Admin user management

The `/admin` user inventory supports versioned profile and email edits, role changes, account disable/re-enable, temporary-password assignment, and irreversible user deletion. Every effective administrator action and maintenance anonymization writes `admin_audit_log` in the same database transaction as its state change. Password values and hashes are never included in responses or audit metadata.

## Initial bootstrap and recovery

After the Compose migration completes, create the first active administrator
with:

```sh
docker compose run --rm app npm run admin:bootstrap -- --email admin@example.com --display-name "StreamTumi Administrator"
```

The command refuses to run when an active administrator already exists. It
creates a verified administrator, prints a generated temporary password, and
requires the password to be replaced after the first sign-in.

Reset an existing active administrator with:

```sh
docker compose run --rm app npm run admin:reset-password -- --email admin@example.com
```

This prints a new temporary password, sets the forced-change flag, and revokes
the administrator's web, mobile, and device sessions. Treat command output as a
credential and clear it from retained terminal logs.

## Migration preflight

`sql/010_admin_user_management.sql` adds user version, update, disable, forced-password, deletion, and anonymization state. It also changes `stations.owner_id` to `ON DELETE RESTRICT` so deleting a user can never cascade through owned stations.

The migration deliberately fails before creating the normalized unique index if existing emails collide under `lower(btrim(email))`. Inspect collisions before migration with:

```sql
SELECT lower(btrim(email)) AS normalized_email, array_agg(id ORDER BY created_at) AS user_ids
FROM users
GROUP BY lower(btrim(email))
HAVING count(*) > 1;
```

Resolve each identity explicitly according to the deployment's account-recovery and ownership policy, then rerun `npm run db:migrate`. The migration never selects a winner or merges users, stations, credentials, or audit history.

## Privileged transaction rules

User mutations require a same-origin request, a current administrator session, a UUID target, and the displayed target `expectedVersion`. The service starts a serializable transaction, acquires a transaction-scoped privileged-operation advisory lock, and locks/revalidates the actor and target rows. This prevents two administrators from concurrently demoting or disabling each other around the last-enabled-admin check.

The backend rejects self-demotion, self-disable, self-delete, and any action that removes the last enabled administrator. A stale target returns `VERSION_CONFLICT`; a normalized email collision returns `EMAIL_EXISTS`. Refresh the dashboard before retrying either conflict.

Role changes and account disabling atomically revoke all sessions and all active moderation service tokens created by that user. Re-enabling creates or restores no credentials. The user must sign in again after any role or status change.

## Temporary passwords

An administrator enters a temporary value in the account dialog. The server hashes it with bcrypt cost 12, sets `must_change_password`, revokes all sessions, and returns only account state and audit data.

After signing in with the temporary password, the account is restricted to `/account/change-password` and its API. Ordinary authenticated and moderation APIs reject that session. Successful replacement verifies the temporary/current password, writes a new bcrypt hash, clears the flag, revokes every session again, and requires a fresh login.

## Irreversible deletion

The account dialog requires the exact current email as typed confirmation and clearly marks deletion irreversible. The backend first locks all owned stations and refuses the complete request if any has `legal_hold_at` set.

An accepted request atomically disables the account, revokes sessions and moderation tokens, stops access to every owned station, and applies the existing `deleted_at`/`purge_after` seven-day station recovery fields using the database clock. Account-level deletion cannot be cancelled even though station rows use the same delayed purge mechanism. In-flight station creation and restoration lock and recheck active account state, and a station cannot be restored after its purge deadline.

Maintenance purges eligible station rows and object prefixes first. It anonymizes the user tombstone only after `anonymize_after` and only when no station row remains owned by the user. Anonymization replaces email, display name, and password; sets role `USER`; clears explicit-content preferences; removes fan/rating rows; and revokes credentials again. Audit and moderation/legal snapshots remain intact.

## CLI role changes

The role script uses the same service and invariants as the API:

```sh
docker compose run --rm app npm run user:set-role -- --email owner@example.com --role MODERATOR --actor-email admin@example.com
```

The only no-actor mode bootstraps the first enabled administrator and is refused once one exists:

```sh
docker compose run --rm app npm run user:set-role -- --email owner@example.com --role ADMIN
```

Both paths write an audit entry. The script cannot silently bypass self/last-admin, actor-status, serialization, or optimistic-version checks.
