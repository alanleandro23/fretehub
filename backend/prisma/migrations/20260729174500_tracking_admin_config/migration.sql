-- Configurações administrativas persistidas no banco.
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- Padroniza todos os monitoramentos para uma consulta por hora.
UPDATE "ShipmentTracking"
SET "checkIntervalMinutes" = 60,
    "nextCheckAt" = CASE
      WHEN "monitoringActive" = true AND "dataEntrega" IS NULL
        THEN GREATEST("nextCheckAt", CURRENT_TIMESTAMP + INTERVAL '1 hour')
      ELSE "nextCheckAt"
    END;
