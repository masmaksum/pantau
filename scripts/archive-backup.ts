import "dotenv/config";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const output = process.argv[2];
if (!output)
  throw new Error(
    "Gunakan: npm run archive:backup -- backups/news-YYYY-MM-DD.sqlite",
  );
const source = resolve(process.env.ARCHIVE_PATH ?? "data/news.sqlite");
const target = resolve(output);
if (source === target)
  throw new Error("Target backup harus berbeda dari database sumber");
await mkdir(dirname(target), { recursive: true });
const sourceDb = new DatabaseSync(source, { readOnly: true });
try {
  // Reserve exclusively: never overwrite a previous backup.
  const reservation = await open(target, "wx", 0o600);
  await reservation.close();
  await backup(sourceDb, target);
  console.log(`Backup SQLite selesai: ${target}`);
} finally {
  sourceDb.close();
}
