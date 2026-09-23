import { db } from "@/lib/db";
import { bootstrapFirstAdmin, changeUserRole } from "@/lib/admin-users";
import type { AuthUser, UserRole } from "@/lib/auth";
import { emailSchema } from "@/lib/validation";

async function main() {
  const emailIndex = process.argv.indexOf("--email");
  const roleIndex = process.argv.indexOf("--role");
  const actorEmailIndex = process.argv.indexOf("--actor-email");
  const rawEmail = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
  const rawActorEmail = actorEmailIndex >= 0 ? process.argv[actorEmailIndex + 1] : undefined;
  const email = rawEmail ? emailSchema.parse(rawEmail) : undefined;
  const actorEmail = rawActorEmail ? emailSchema.parse(rawActorEmail) : undefined;
  const role = roleIndex >= 0 ? process.argv[roleIndex + 1]?.trim().toUpperCase() : undefined;
  if (!email || !role || !["USER", "MODERATOR", "ADMIN"].includes(role)) {
    throw new Error("Usage: npm run user:set-role -- --email owner@example.com --role ADMIN [--actor-email admin@example.com]");
  }

  if (!actorEmail) {
    if (role !== "ADMIN") throw new Error("--actor-email is required except when bootstrapping the first administrator.");
    await bootstrapFirstAdmin(email);
    console.info(`Bootstrapped ${email} as ADMIN with an audit entry`);
    return;
  }

  const [actorResult, targetResult] = await Promise.all([
    db.query<{
      id: string; email: string; display_name: string; role: UserRole;
      must_change_password: boolean; show_explicit_content: boolean; explicit_age_attested_at: Date | null;
    }>(
      `SELECT id, email, display_name, role, must_change_password, show_explicit_content, explicit_age_attested_at
         FROM users WHERE lower(btrim(email)) = $1`,
      [actorEmail],
    ),
    db.query<{ id: string; version: number }>("SELECT id, version FROM users WHERE lower(btrim(email)) = $1", [email]),
  ]);
  const actorRow = actorResult.rows[0];
  const target = targetResult.rows[0];
  if (!actorRow) throw new Error(`No actor exists for ${actorEmail}`);
  if (!target) throw new Error(`No user exists for ${email}`);
  const actor: AuthUser = {
    id: actorRow.id,
    email: actorRow.email,
    displayName: actorRow.display_name,
    role: actorRow.role,
    mustChangePassword: actorRow.must_change_password,
    showExplicitContent: actorRow.show_explicit_content,
    explicitAgeAttestedAt: actorRow.explicit_age_attested_at?.toISOString() ?? null,
  };
  await changeUserRole(target.id, role as UserRole, target.version, actor);
  console.info(`Updated ${email} to ${role}`);
}

main().finally(() => db.end()).catch((error) => { console.error(error); process.exitCode = 1; });
