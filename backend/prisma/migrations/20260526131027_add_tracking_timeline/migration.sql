-- CreateTable
CREATE TABLE "ShipmentTracking" (
    "id" SERIAL NOT NULL,
    "quoteId" INTEGER,
    "carrierId" INTEGER,
    "companyId" INTEGER,
    "userId" INTEGER,
    "numeroNota" TEXT,
    "numeroPedido" TEXT,
    "conhecimento" TEXT,
    "documento" TEXT,
    "status" TEXT,
    "previsaoEntrega" TIMESTAMP(3),
    "dataEntrega" TIMESTAMP(3),
    "cidadeDestino" TEXT,
    "ufDestino" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" SERIAL NOT NULL,
    "trackingId" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "dataEvento" TIMESTAMP(3),
    "cidade" TEXT,
    "uf" TEXT,
    "tipo" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_trackingId_fkey" FOREIGN KEY ("trackingId") REFERENCES "ShipmentTracking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
