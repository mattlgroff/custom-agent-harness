import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import pg from "pg";
config({ path: ".env.local", quiet: true });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(
    await readFile(new URL("../db/001-initial.sql", import.meta.url), "utf8"),
  );
  console.log(
    "Database schema ready. Demo cases are seeded individually from the UI.",
  );
} finally {
  await pool.end();
}
