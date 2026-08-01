CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "trackingId" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationRecipient" (
    "id" SERIAL NOT NULL,
    "notificationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "emailError" TEXT,
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailNextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_fingerprint_key" ON "Notification"("fingerprint");
CREATE INDEX "Notification_trackingId_type_idx" ON "Notification"("trackingId", "type");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_key" ON "NotificationRecipient"("notificationId", "userId");
CREATE INDEX "NotificationRecipient_userId_readAt_archivedAt_idx" ON "NotificationRecipient"("userId", "readAt", "archivedAt");
CREATE INDEX "NotificationRecipient_emailSentAt_emailNextAttemptAt_idx" ON "NotificationRecipient"("emailSentAt", "emailNextAttemptAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_trackingId_fkey"
FOREIGN KEY ("trackingId") REFERENCES "ShipmentTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
