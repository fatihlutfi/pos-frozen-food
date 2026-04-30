-- Remove storage_zone field and enum from products table

ALTER TABLE "products" DROP COLUMN "storageZone";

DROP TYPE IF EXISTS "StorageZone";
