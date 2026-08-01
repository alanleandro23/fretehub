ALTER TABLE "ShipmentTracking"
ADD COLUMN "destinatarioNome" TEXT,
ADD COLUMN "hasDivergence" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DeliveryProof" (
    "id" SERIAL NOT NULL,
    "trackingId" INTEGER NOT NULL,
    "uploadedById" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "fileName" TEXT,
    "mimeType" TEXT,
    "storagePath" TEXT,
    "externalUrl" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryProof_trackingId_createdAt_idx" ON "DeliveryProof"("trackingId", "createdAt");
CREATE INDEX "DeliveryProof_uploadedById_idx" ON "DeliveryProof"("uploadedById");

ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_trackingId_fkey"
FOREIGN KEY ("trackingId") REFERENCES "ShipmentTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "ShipmentTracking" AS tracking
SET "hasDivergence" = true
WHERE EXISTS (
    SELECT 1
    FROM "ShipmentEvent" AS event
    WHERE event."trackingId" = tracking."id"
      AND (
        event."tipo" ILIKE '%DIVERG%'
        OR event."descricao" ILIKE '%DIVERG%'
        OR event."descricao" ILIKE '%NAO ENTREG%'
        OR event."descricao" ILIKE '%NÃO ENTREG%'
        OR event."descricao" ILIKE '%DESTINATARIO AUSENTE%'
        OR event."descricao" ILIKE '%DESTINATÁRIO AUSENTE%'
        OR event."descricao" ILIKE '%RECUS%'
        OR event."descricao" ILIKE '%AVARIA%'
        OR event."descricao" ILIKE '%EXTRAVIO%'
        OR event."descricao" ILIKE '%DEVOLU%'
      )
);
