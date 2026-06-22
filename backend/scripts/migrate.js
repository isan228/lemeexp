import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(scriptDir, "..", ".env") });

const { Pool } = pg;

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = await readFile(new URL("../sql/schema.sql", import.meta.url), "utf8");

  await pool.query(sql);
  await pool.end();
  console.log("Migration completed");
}

run().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
