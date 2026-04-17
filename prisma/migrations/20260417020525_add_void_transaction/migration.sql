-- AlterEnum
ALTER TYPE "TransactionStatus" ADD VALUE 'VOIDED';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);
