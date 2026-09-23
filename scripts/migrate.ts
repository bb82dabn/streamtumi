import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { db } from "@/lib/db";
import { ensureBucket } from "@/lib/storage";

async function main() {
  await db.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const directory = path.join(process.cwd(), "sql");
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  const client = await db.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('streamtumi-schema-migrations'))");
    for (const file of files) {
      const sql = await fs.readFile(path.join(directory, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const applied = await client.query<{ checksum: string }>("SELECT checksum FROM public.schema_migrations WHERE name = $1", [file]);
      if (applied.rows[0]) {
        if (applied.rows[0].checksum !== checksum) throw new Error(`Applied migration ${file} has changed.`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
        console.info(`Applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('streamtumi-schema-migrations'))");
    client.release();
  }
  await ensureBucket();
  console.info("Database and object storage are ready");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
