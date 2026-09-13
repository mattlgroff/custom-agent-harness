import { Pool } from "pg";

let pool: Pool | undefined;
export function db() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is required. Run npm run setup and npm run db:migrate.",
    );
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    pool.on("error", () =>
      console.error(
        "An idle PostgreSQL connection closed; the pool will reconnect.",
      ),
    );
  }
  return pool;
}
