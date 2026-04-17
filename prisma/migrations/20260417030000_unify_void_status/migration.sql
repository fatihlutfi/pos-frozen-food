-- Data migration: convert all CANCELLED → VOIDED
UPDATE "transactions"
SET
  status       = 'VOIDED',
  "voidReason" = COALESCE("voidReason", 'Dibatalkan (migrasi dari status Cancelled)'),
  "voidedAt"   = COALESCE("voidedAt", "updatedAt")
WHERE status = 'CANCELLED';

-- At this point the DB may already have TransactionStatus_old (original enum) and
-- TransactionStatus (new enum COMPLETED|VOIDED). Handle both scenarios:

-- Scenario A: column is on TransactionStatus_old, TransactionStatus already exists
-- Scenario B: fresh run — TransactionStatus still has CANCELLED, _old does not exist

DO $$
BEGIN
  -- Check if the column is already on the old type (partial migration recovery)
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type t  ON t.oid = a.atttypid
    WHERE c.relname = 'transactions'
      AND a.attname = 'status'
      AND t.typname = 'TransactionStatus_old'
  ) THEN
    -- Column uses the old type; TransactionStatus (new) already exists.
    -- Just swap the column, restore default, drop old.
    ALTER TABLE "transactions"
      ALTER COLUMN "status" TYPE "TransactionStatus"
      USING "status"::text::"TransactionStatus";

    ALTER TABLE "transactions"
      ALTER COLUMN "status" SET DEFAULT 'COMPLETED'::"TransactionStatus";

    DROP TYPE "TransactionStatus_old";

  ELSE
    -- Fresh run: rename → create new → swap → restore default → drop old
    ALTER TABLE "transactions" ALTER COLUMN "status" DROP DEFAULT;

    ALTER TYPE "TransactionStatus" RENAME TO "TransactionStatus_old";

    CREATE TYPE "TransactionStatus" AS ENUM ('COMPLETED', 'VOIDED');

    ALTER TABLE "transactions"
      ALTER COLUMN "status" TYPE "TransactionStatus"
      USING "status"::text::"TransactionStatus";

    ALTER TABLE "transactions"
      ALTER COLUMN "status" SET DEFAULT 'COMPLETED'::"TransactionStatus";

    DROP TYPE "TransactionStatus_old";
  END IF;
END
$$;
