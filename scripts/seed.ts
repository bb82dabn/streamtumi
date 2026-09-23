import { hash } from "bcryptjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db, query } from "@/lib/db";
import { newAccessToken } from "@/lib/stations";
import { bucket, ensureBucket, storage } from "@/lib/storage";
import { getTranscodeQueue } from "@/lib/queue";
import { getRedis } from "@/lib/redis";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Database seeding is disabled in production.");
  const email = (process.env.SEED_EMAIL ?? "operator@streamtumi.local").trim().toLowerCase();
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error("SEED_PASSWORD is required.");
  const user = await query<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash) VALUES ($1, 'Demo Operator', $2)
     ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name,
       version = users.version + 1, updated_at = now() RETURNING id`,
    [email, await hash(password, 12)],
  );
  let station = await query<{ id: string; access_token_ciphertext: string }>(
    "SELECT id, access_token_ciphertext FROM stations WHERE owner_id = $1 AND name = 'StreamTumi Test Signal'",
    [user.rows[0].id],
  );
  if (!station.rows[0]) {
    const access = newAccessToken();
    station = await query<{ id: string; access_token_ciphertext: string }>(
       `INSERT INTO stations
       (owner_id, name, description, mode, transition_ms, genre_id, visibility,
        access_token_hash, access_token_ciphertext, access_token_hint)
       SELECT $1, 'StreamTumi Test Signal', 'A copyright-free station generated entirely with FFmpeg test patterns.',
              'SYNCHRONIZED', 1000, g.id, 'PRIVATE', $2, $3, $4
         FROM station_genres g WHERE g.slug = 'entertainment'
       RETURNING id, access_token_ciphertext`,
      [user.rows[0].id, access.hash, access.ciphertext, access.hint],
    );
  }
  const sampleDirectory = path.join(process.cwd(), "sample-media");
  if (await fs.stat(sampleDirectory).then(() => true).catch(() => false)) {
    await ensureBucket();
    for (const filename of (await fs.readdir(sampleDirectory)).filter((name) => /\.(mp4|webm|mkv)$/i.test(name)).sort()) {
      const exists = await query("SELECT 1 FROM videos WHERE station_id = $1 AND source_file_name = $2", [station.rows[0].id, filename]);
      if (exists.rowCount) continue;
      const absolute = path.join(sampleDirectory, filename);
      const stat = await fs.stat(absolute);
      const video = await query<{ id: string }>(
        `INSERT INTO videos (station_id, title, status, source_key, source_file_name, mime_type, size_bytes)
         VALUES ($1, $2, 'QUEUED', '', $3, $4, $5) RETURNING id`,
        [
          station.rows[0].id,
          filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
          filename,
          filename.endsWith(".webm") ? "video/webm" : filename.endsWith(".mkv") ? "video/x-matroska" : "video/mp4",
          stat.size,
        ],
      );
      const key = `stations/${station.rows[0].id}/sources/${video.rows[0].id}/${filename}`;
      await storage.fPutObject(bucket, key, absolute);
      await query("UPDATE videos SET source_key = $1 WHERE id = $2", [key, video.rows[0].id]);
      await getTranscodeQueue().add("transcode-video", { videoId: video.rows[0].id }, { jobId: `video-${video.rows[0].id}` });
    }
  }
  console.info(`Seed account created: ${email}`);
  console.info(`Station created: ${station.rows[0].id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getTranscodeQueue().close();
    await getRedis().quit();
    await db.end();
  });
