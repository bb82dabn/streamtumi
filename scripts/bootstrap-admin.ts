import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db, transaction } from "@/lib/db";
import { emailSchema } from "@/lib/validation";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function main(): Promise<void> {
  const email = emailSchema.parse(argument("--email"));
  const displayName = argument("--display-name") || "StreamTumi Administrator";
  if (displayName.length > 80) throw new Error("--display-name must be 80 characters or fewer.");

  const temporaryPassword = randomBytes(24).toString("base64url");
  const passwordHash = await hash(temporaryPassword, 12);
  const user = await transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('streamtumi-admin-bootstrap'))");
    const existing = await client.query(
      `SELECT 1 FROM users
        WHERE role = 'ADMIN' AND disabled_at IS NULL
          AND deletion_requested_at IS NULL AND anonymized_at IS NULL`,
    );
    if (existing.rowCount) throw new Error("An active administrator already exists.");

    const created = await client.query<{ id: string; email: string }>(
      `INSERT INTO users
         (email, display_name, password_hash, role, must_change_password, email_verified_at)
       VALUES ($1, $2, $3, 'ADMIN', true, now())
       RETURNING id, email`,
      [email, displayName, passwordHash],
    );
    await client.query(
      `INSERT INTO admin_audit_log
         (actor_user_id, actor_name, target_user_id, target_label, action, metadata)
       VALUES (NULL, 'System bootstrap CLI', $1, $2, 'ADMIN_BOOTSTRAPPED', $3)`,
      [created.rows[0].id, created.rows[0].email, { mustChangePassword: true }],
    );
    return created.rows[0];
  });

  console.info(`Administrator created: ${user.email}`);
  console.info(`Temporary password: ${temporaryPassword}`);
  console.info("Sign in once and replace this password immediately.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
