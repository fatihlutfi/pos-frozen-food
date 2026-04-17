-- Add costPrice (HPP) to products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "costPrice" INTEGER NOT NULL DEFAULT 0;

-- Add costPrice + discountPercent snapshot to transaction_items
ALTER TABLE "transaction_items" ADD COLUMN IF NOT EXISTS "costPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "transaction_items" ADD COLUMN IF NOT EXISTS "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable: product_discount_rules
CREATE TABLE IF NOT EXISTS "product_discount_rules" (
    "id"              TEXT NOT NULL,
    "minQty"          INTEGER NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId"       TEXT NOT NULL,

    CONSTRAINT "product_discount_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_discount_rules_productId_minQty_key" UNIQUE ("productId", "minQty")
);

-- AddForeignKey
ALTER TABLE "product_discount_rules"
    ADD CONSTRAINT "product_discount_rules_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
