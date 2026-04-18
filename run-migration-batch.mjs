import { readFileSync } from "fs";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = readFileSync(
  "./prisma/migrations/20260418090000_add_product_batch/migration.sql",
  "utf8"
);

try {
  console.log("Running migration: add_product_batch...");
  await pool.query(sql);
  console.log("✓ Migration SQL executed");

  const existing = await pool.query(
    `SELECT id FROM _prisma_migrations WHERE migration_name = $1`,
    ["20260418090000_add_product_batch"]
  );
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
       VALUES (gen_random_uuid(), 'manual', '20260418090000_add_product_batch', now(), now(), 1)`
    );
    console.log("✓ Recorded in _prisma_migrations");
  } else {
    console.log("→ Already recorded");
  }
} catch (e) {
  console.error("Error:", e.message);
} finally {
  await pool.end();
}
