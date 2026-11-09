// Aplica las migraciones de db/migrations en orden, una sola vez cada una.
// Uso: DATABASE_URL=postgres://... node scripts/migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1|host=\//.test(url) ? false : { rejectUnauthorized: true },
});
await client.connect();
await client.query(`create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
)`);

const applied = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  if (applied.has(file)) continue;
  const sql = await readFile(join(dir, file), "utf8");
  process.stdout.write(`Aplicando ${file}... `);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log("listo");
  } catch (e) {
    await client.query("rollback");
    console.log("falló");
    console.error(e.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("Base de datos al día.");
