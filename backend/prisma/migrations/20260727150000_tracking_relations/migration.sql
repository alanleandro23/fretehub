-- Remove referências órfãs antes de criar as chaves estrangeiras.
UPDATE "ShipmentTracking" SET "quoteId" = NULL
WHERE "quoteId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Quote" WHERE "Quote"."id" = "ShipmentTracking"."quoteId"
);

UPDATE "ShipmentTracking" SET "carrierId" = NULL
WHERE "carrierId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Carrier" WHERE "Carrier"."id" = "ShipmentTracking"."carrierId"
);

UPDATE "ShipmentTracking" SET "companyId" = NULL
WHERE "companyId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Company" WHERE "Company"."id" = "ShipmentTracking"."companyId"
);

UPDATE "ShipmentTracking" SET "userId" = NULL
WHERE "userId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "User" WHERE "User"."id" = "ShipmentTracking"."userId"
);

ALTER TABLE "ShipmentTracking"
  ADD CONSTRAINT "ShipmentTracking_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShipmentTracking"
  ADD CONSTRAINT "ShipmentTracking_carrierId_fkey"
  FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShipmentTracking"
  ADD CONSTRAINT "ShipmentTracking_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShipmentTracking"
  ADD CONSTRAINT "ShipmentTracking_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
