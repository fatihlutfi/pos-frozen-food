-- Composite indexes untuk production performance
-- Semua pakai IF NOT EXISTS — aman dijalankan ulang (idempotent)

-- transactions
CREATE INDEX IF NOT EXISTS "transactions_branchId_createdAt_idx"        ON "transactions"("branchId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "transactions_branchId_status_createdAt_idx"  ON "transactions"("branchId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "transactions_shiftId_idx"                    ON "transactions"("shiftId");
CREATE INDEX IF NOT EXISTS "transactions_userId_createdAt_idx"           ON "transactions"("userId", "createdAt" DESC);

-- transaction_items
CREATE INDEX IF NOT EXISTS "transaction_items_transactionId_idx"         ON "transaction_items"("transactionId");
CREATE INDEX IF NOT EXISTS "transaction_items_productId_idx"             ON "transaction_items"("productId");

-- stock_logs
CREATE INDEX IF NOT EXISTS "stock_logs_branchId_createdAt_idx"           ON "stock_logs"("branchId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "stock_logs_productId_branchId_createdAt_idx" ON "stock_logs"("productId", "branchId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "stock_logs_transactionId_idx"                ON "stock_logs"("transactionId");

-- cashier_shifts
CREATE INDEX IF NOT EXISTS "cashier_shifts_userId_status_idx"            ON "cashier_shifts"("userId", "status");
CREATE INDEX IF NOT EXISTS "cashier_shifts_branchId_status_openedAt_idx" ON "cashier_shifts"("branchId", "status", "openedAt" DESC);

-- products
CREATE INDEX IF NOT EXISTS "products_categoryId_isActive_idx"            ON "products"("categoryId", "isActive");
CREATE INDEX IF NOT EXISTS "products_isActive_name_idx"                  ON "products"("isActive", "name");
