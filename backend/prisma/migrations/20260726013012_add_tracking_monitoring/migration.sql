-- AlterTable
ALTER TABLE "ShipmentTracking" ADD COLUMN     "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastCheckError" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "monitoringActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notificationSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ShipmentTracking_monitoringActive_nextCheckAt_idx" ON "ShipmentTracking"("monitoringActive", "nextCheckAt");

-- CreateIndex
CREATE INDEX "ShipmentTracking_companyId_carrierId_idx" ON "ShipmentTracking"("companyId", "carrierId");

-- CreateIndex
CREATE INDEX "ShipmentTracking_status_idx" ON "ShipmentTracking"("status");
