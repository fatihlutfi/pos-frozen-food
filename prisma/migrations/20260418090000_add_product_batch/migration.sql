-- CreateTable
CREATE TABLE "product_batches" (
    "id"             TEXT NOT NULL,
    "batchCode"      TEXT NOT NULL,
    "productionDate" TIMESTAMP(3),
    "expiryDate"     TIMESTAMP(3) NOT NULL,
    "quantity"       INTEGER NOT NULL DEFAULT 0,
    "initialQty"     INTEGER NOT NULL DEFAULT 0,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId"      TEXT NOT NULL,
    "branchId"       TEXT NOT NULL,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_batches_productId_branchId_expiryDate_idx"
    ON "product_batches"("productId", "branchId", "expiryDate");

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
