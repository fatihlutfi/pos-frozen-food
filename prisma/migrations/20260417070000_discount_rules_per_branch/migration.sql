-- Migration: discount_rules_per_branch
-- Add branchId to product_discount_rules, update unique constraint

-- 1. Add branchId column (nullable first so existing rows don't break)
ALTER TABLE "product_discount_rules"
  ADD COLUMN "branchId" TEXT;

-- 2. Drop old unique constraint (productId, minQty) if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_discount_rules_productId_minQty_key'
  ) THEN
    ALTER TABLE "product_discount_rules"
      DROP CONSTRAINT "product_discount_rules_productId_minQty_key";
  END IF;
END $$;

-- 3. Delete any rows that have no branchId (orphan rules from before this feature)
DELETE FROM "product_discount_rules" WHERE "branchId" IS NULL;

-- 4. Make branchId NOT NULL now that orphans are removed
ALTER TABLE "product_discount_rules"
  ALTER COLUMN "branchId" SET NOT NULL;

-- 5. Add foreign key to branches
ALTER TABLE "product_discount_rules"
  ADD CONSTRAINT "product_discount_rules_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Add new unique constraint (productId, branchId, minQty)
ALTER TABLE "product_discount_rules"
  ADD CONSTRAINT "product_discount_rules_productId_branchId_minQty_key"
  UNIQUE ("productId", "branchId", "minQty");
