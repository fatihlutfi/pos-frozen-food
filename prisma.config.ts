import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Gunakan direct URL (port 5432) untuk migrate — pooler tidak support DDL
    url: process.env.DIRECT_URL!,
  },
});
