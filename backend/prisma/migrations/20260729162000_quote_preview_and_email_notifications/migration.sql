-- A cotação só entra no histórico após a confirmação explícita do usuário.
ALTER TABLE "Quote" ADD COLUMN "draftId" TEXT;
CREATE UNIQUE INDEX "Quote_draftId_key" ON "Quote"("draftId");

-- Controle separado para a notificação visual e o envio de e-mail da entrega.
ALTER TABLE "ShipmentTracking"
  ADD COLUMN "emailNotificationSentAt" TIMESTAMP(3),
  ADD COLUMN "emailNotificationError" TEXT,
  ADD COLUMN "emailNotificationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "emailNotificationNextAttemptAt" TIMESTAMP(3);

CREATE INDEX "ShipmentTracking_emailNotificationSentAt_emailNotificationNextAttemptAt_idx"
  ON "ShipmentTracking"("emailNotificationSentAt", "emailNotificationNextAttemptAt");
