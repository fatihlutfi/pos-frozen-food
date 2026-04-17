-- CreateEnum
CREATE TYPE "StorageZone" AS ENUM ('FROZEN', 'CHILLED', 'AMBIENT', 'DISPLAY_ONLY');

-- AlterTable
ALTER TABLE "products" ADD COLUMN "storageZone" "StorageZone" NOT NULL DEFAULT 'FROZEN';
