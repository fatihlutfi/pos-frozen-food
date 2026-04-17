-- Add OPNAME to StockLogType enum
ALTER TYPE "StockLogType" ADD VALUE IF NOT EXISTS 'OPNAME';

-- CreateEnum: StockOpnameStatus
DO $$ BEGIN
  CREATE TYPE "StockOpnameStatus" AS ENUM ('DRAFT', 'CONFIRMED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: stock_opnames
CREATE TABLE IF NOT EXISTS "stock_opnames" (
    "id"          TEXT NOT NULL,
    "status"      "StockOpnameStatus" NOT NULL DEFAULT 'DRAFT',
    "note"        TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId"    TEXT NOT NULL,
    "userId"      TEXT NOT NULL,

    CONSTRAINT "stock_opnames_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_opname_items
CREATE TABLE IF NOT EXISTS "stock_opname_items" (
    "id"          TEXT NOT NULL,
    "systemQty"   INTEGER NOT NULL,
    "physicalQty" INTEGER,
    "opnameId"    TEXT NOT NULL,
    "productId"   TEXT NOT NULL,

    CONSTRAINT "stock_opname_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_opname_items_opnameId_productId_key" UNIQUE ("opnameId", "productId")
);

-- AddForeignKey: stock_opnames
ALTER TABLE "stock_opnames"
    ADD CONSTRAINT "stock_opnames_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_opnames"
    ADD CONSTRAINT "stock_opnames_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: stock_opname_items
ALTER TABLE "stock_opname_items"
    ADD CONSTRAINT "stock_opname_items_opnameId_fkey"
    FOREIGN KEY ("opnameId") REFERENCES "stock_opnames"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_opname_items"
    ADD CONSTRAINT "stock_opname_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
