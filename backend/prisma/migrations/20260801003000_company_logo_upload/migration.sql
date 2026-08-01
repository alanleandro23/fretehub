ALTER TABLE "Company"
  ADD COLUMN "logoFileName" TEXT,
  ADD COLUMN "logoMimeType" TEXT,
  ADD COLUMN "logoStoragePath" TEXT,
  ADD COLUMN "logoUpdatedAt" TIMESTAMP(3);
