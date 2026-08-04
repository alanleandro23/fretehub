-- Distribui o histórico de notificações a todos os usuários ativos.
-- O estado de leitura/arquivamento permanece individual por usuário.
-- emailNextAttemptAt fica NULL para não disparar e-mails retroativos do histórico.

INSERT INTO "NotificationRecipient" (
  "notificationId",
  "userId",
  "readAt",
  "archivedAt",
  "emailSentAt",
  "emailError",
  "emailAttempts",
  "emailNextAttemptAt",
  "createdAt",
  "updatedAt"
)
SELECT
  notification."id",
  app_user."id",
  NULL,
  NULL,
  NULL,
  NULL,
  0,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Notification" AS notification
CROSS JOIN "User" AS app_user
WHERE app_user."active" = TRUE
ON CONFLICT ("notificationId", "userId") DO NOTHING;
