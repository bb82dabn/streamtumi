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
  const temporaryPassword = randomBytes(24).toString("base64url");
  const passwordHash = await hash(temporaryPassword, 12);
  const user = await transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('streamtumi-admin-bootstrap'))");
    const target = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM users
        WHERE lower(btrim(email)) = $1 AND role = 'ADMIN'
          AND disabled_at IS NULL AND deletion_requested_at IS NULL
          AND anonymized_at IS NULL
        FOR UPDATE`,
      [email],
    );
    if (!target.rows[0]) throw new Error("No active administrator exists for that email.");

    await client.query(
      `UPDATE users
          SET password_hash = $2, must_change_password = true,
              version = version + 1, updated_at = now()
        WHERE id = $1`,
      [target.rows[0].id, passwordHash],
    );
    await Promise.all([
      client.query("DELETE FROM sessions WHERE user_id = $1", [target.rows[0].id]),
      client.query("DELETE FROM mobile_refresh_tokens WHERE user_id = $1", [target.rows[0].id]),
      client.query("DELETE FROM device_sessions WHERE user_id = $1", [target.rows[0].id]),
    ]);
    await client.query(
      `INSERT INTO admin_audit_log
         (actor_user_id, actor_name, target_user_id, target_label, action, metadata)
       VALUES (NULL, 'System recovery CLI', $1, $2, 'ADMIN_PASSWORD_RESET', $3)`,
      [target.rows[0].id, target.rows[0].email, { mustChangePassword: true, sessionsRevoked: true }],
    );
    return target.rows[0];
  });

  console.info(`Administrator reset: ${user.email}`);
  console.info(`Temporary password: ${temporaryPassword}`);
  console.info("Sign in once and replace this password immediately.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
