import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Client khusus interactive transactions — wajib direct connection, bukan pgBouncer.
// Pastikan DIRECT_URL (port 5432) tersedia di Vercel environment variables.
const globalForPrismaTx = globalThis;

if (!globalForPrismaTx.prismaTx) {
  const pool = new Pool({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    max: 5, // batasi pool — interactive tx butuh dedicated connection
  });
  const adapter = new PrismaPg(pool);
  globalForPrismaTx.prismaTx = new PrismaClient({ adapter });
}

export default globalForPrismaTx.prismaTx;
