const prisma = require('../db');
const { sendNotificationEmail, loadEmailConfig } = require('./email.service');

const NOTIFICATION_TYPES = Object.freeze({
  DELIVERY: 'DELIVERY',
  DELAY: 'DELAY',
  TRACKING_FAILURE: 'TRACKING_FAILURE',
  DIVERGENCE: 'DIVERGENCE',
  DELIVERY_PROOF: 'DELIVERY_PROOF'
});

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes || 15) * 60 * 1000);
}

function nextEmailAttemptDate(attempts = 0) {
  const minutes = Math.min(15 * (2 ** Math.max(Number(attempts), 0)), 24 * 60);
  return addMinutes(new Date(), minutes);
}

function trackingReference(tracking) {
  if (tracking?.numeroNota) return `NF ${tracking.numeroNota}`;
  if (tracking?.numeroPedido) return `Pedido ${tracking.numeroPedido}`;
  if (tracking?.conhecimento) return `CT-e ${tracking.conhecimento}`;
  return `Tracking #${tracking?.id || '-'}`;
}

async function recipientIdsForTracking(tracking, audience = 'operations') {
  const where = {
    active: true,
    OR: []
  };

  if (tracking?.userId) where.OR.push({ id: tracking.userId });
  where.OR.push({ role: 'ADMIN' });

  if (audience !== 'admin') {
    where.OR.push({
      role: 'OPERATOR',
      ...(tracking?.companyId ? { companyId: tracking.companyId } : {})
    });
  }

  const users = await prisma.user.findMany({
    where,
    select: { id: true }
  });

  return [...new Set(users.map((user) => user.id))];
}

async function createNotification({
  type,
  severity = 'info',
  title,
  message,
  fingerprint,
  tracking = null,
  metadata = null,
  audience = 'operations'
}) {
  if (!fingerprint) throw new Error('A notificação precisa de uma chave de deduplicação.');

  const recipientIds = await recipientIdsForTracking(tracking, audience);
  if (!recipientIds.length) return null;

  const notification = await prisma.notification.upsert({
    where: { fingerprint },
    create: {
      type,
      severity,
      title,
      message,
      fingerprint,
      trackingId: tracking?.id || null,
      metadata
    },
    update: {
      severity,
      title,
      message,
      metadata,
      trackingId: tracking?.id || null
    }
  });

  await prisma.notificationRecipient.createMany({
    data: recipientIds.map((userId) => ({
      notificationId: notification.id,
      userId,
      emailNextAttemptAt: new Date()
    })),
    skipDuplicates: true
  });

  return notification;
}

function formatDestination(tracking) {
  return [tracking?.cidadeDestino, tracking?.ufDestino].filter(Boolean).join(' / ') || 'destino não informado';
}

async function notifyDelivery(tracking) {
  const reference = trackingReference(tracking);
  return createNotification({
    type: NOTIFICATION_TYPES.DELIVERY,
    severity: 'success',
    title: `Carga entregue — ${reference}`,
    message: `${tracking?.carrier?.nome || 'Transportadora'} confirmou a entrega em ${formatDestination(tracking)}.`,
    fingerprint: `DELIVERY:${tracking.id}`,
    tracking,
    metadata: {
      reference,
      deliveredAt: tracking.dataEntrega || new Date(),
      carrier: tracking?.carrier?.nome || null
    }
  });
}

async function notifyDelay(tracking, prediction) {
  const reference = trackingReference(tracking);
  const expectedDate = new Date(prediction);
  const dateKey = expectedDate.toISOString().slice(0, 10);
  return createNotification({
    type: NOTIFICATION_TYPES.DELAY,
    severity: 'warning',
    title: `Carga atrasada — ${reference}`,
    message: `A previsão de entrega era ${expectedDate.toLocaleDateString('pt-BR')} e a carga ainda não foi entregue.`,
    fingerprint: `DELAY:${tracking.id}:${dateKey}`,
    tracking,
    metadata: { reference, prediction: expectedDate, carrier: tracking?.carrier?.nome || null }
  });
}

async function notifyDivergence(tracking, occurrence = {}) {
  const reference = trackingReference(tracking);
  const description = String(occurrence.description || occurrence.descricao || occurrence.title || 'Divergência logística').trim();
  const sourceKey = String(occurrence.key || occurrence.sourceKey || description)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9:_-]+/g, '_')
    .slice(0, 180);

  return createNotification({
    type: NOTIFICATION_TYPES.DIVERGENCE,
    severity: 'error',
    title: `Divergência — ${reference}`,
    message: description,
    fingerprint: `DIVERGENCE:${tracking.id}:${sourceKey}`,
    tracking,
    metadata: {
      reference,
      occurrence: description,
      eventDate: occurrence.eventDate || occurrence.dataEvento || null,
      carrier: tracking?.carrier?.nome || null
    }
  });
}

async function notifyDeliveryProof(tracking, proof) {
  const reference = trackingReference(tracking);
  const sourceLabel = proof?.source === 'CARRIER' ? 'disponibilizado pela transportadora' : 'anexado manualmente';
  return createNotification({
    type: NOTIFICATION_TYPES.DELIVERY_PROOF,
    severity: 'success',
    title: `Comprovante disponível — ${reference}`,
    message: `Um comprovante de entrega foi ${sourceLabel}.`,
    fingerprint: `DELIVERY_PROOF:${tracking.id}:${proof.id}`,
    tracking,
    metadata: {
      reference,
      proofId: proof.id,
      source: proof.source,
      fileName: proof.fileName || null,
      externalUrl: proof.externalUrl || null,
      carrier: tracking?.carrier?.nome || null
    }
  });
}

async function notifyTrackingFailure(tracking, error, consecutiveErrors = 1) {
  const reference = trackingReference(tracking);
  const dayKey = new Date().toISOString().slice(0, 10);
  return createNotification({
    type: NOTIFICATION_TYPES.TRACKING_FAILURE,
    severity: 'error',
    title: `Falha no rastreamento — ${reference}`,
    message: `${tracking?.carrier?.nome || 'Transportadora'}: ${String(error?.message || error || 'Falha na consulta')}`,
    fingerprint: `TRACKING_FAILURE:${tracking.id}:${dayKey}`,
    tracking,
    audience: 'operations',
    metadata: {
      reference,
      consecutiveErrors,
      carrier: tracking?.carrier?.nome || null
    }
  });
}

async function listNotifications(user, query = {}) {
  const take = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
  const unreadOnly = String(query.unreadOnly || '').toLowerCase() === 'true';

  const rows = await prisma.notificationRecipient.findMany({
    where: {
      userId: user.id,
      archivedAt: null,
      ...(unreadOnly ? { readAt: null } : {})
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      notification: {
        include: {
          tracking: {
            include: {
              carrier: { select: { id: true, nome: true } },
              company: { select: { id: true, razaoSocial: true, nomeFantasia: true } }
            }
          }
        }
      }
    }
  });

  return rows.map((row) => ({
    id: row.notification.id,
    recipientId: row.id,
    type: row.notification.type,
    severity: row.notification.severity,
    title: row.notification.title,
    message: row.notification.message,
    trackingId: row.notification.trackingId,
    metadata: row.notification.metadata,
    createdAt: row.notification.createdAt,
    readAt: row.readAt,
    emailSentAt: row.emailSentAt,
    emailError: row.emailError,
    tracking: row.notification.tracking
  }));
}

async function unreadCount(user) {
  const count = await prisma.notificationRecipient.count({
    where: { userId: user.id, readAt: null, archivedAt: null }
  });
  return { count };
}

async function markNotificationRead(notificationId, user) {
  const result = await prisma.notificationRecipient.updateMany({
    where: {
      notificationId: Number(notificationId),
      userId: user.id,
      archivedAt: null
    },
    data: { readAt: new Date() }
  });
  if (!result.count) throw new Error('Notificação não encontrada.');
  return { success: true };
}

async function markAllNotificationsRead(user) {
  const result = await prisma.notificationRecipient.updateMany({
    where: { userId: user.id, readAt: null, archivedAt: null },
    data: { readAt: new Date() }
  });
  return { success: true, updated: result.count };
}

async function archiveNotification(notificationId, user) {
  const result = await prisma.notificationRecipient.updateMany({
    where: { notificationId: Number(notificationId), userId: user.id },
    data: { archivedAt: new Date(), readAt: new Date() }
  });
  if (!result.count) throw new Error('Notificação não encontrada.');
  return { success: true };
}

async function processPendingNotificationEmails(limit = 40) {
  const config = await loadEmailConfig();
  if (!config.enabled || config.provider === 'none') return [];

  const rows = await prisma.notificationRecipient.findMany({
    where: {
      emailSentAt: null,
      emailAttempts: { lt: 10 },
      emailNextAttemptAt: { lte: new Date() },
      user: { active: true }
    },
    orderBy: { emailNextAttemptAt: 'asc' },
    take: Math.min(Number(limit) || 40, 100),
    include: {
      user: { select: { id: true, name: true, email: true } },
      notification: {
        include: {
          tracking: {
            include: {
              carrier: { select: { id: true, nome: true } },
              company: { select: { id: true, razaoSocial: true, nomeFantasia: true } }
            }
          }
        }
      }
    }
  });

  const results = [];
  for (const row of rows) {
    const claimed = await prisma.notificationRecipient.updateMany({
      where: {
        id: row.id,
        emailSentAt: null,
        emailNextAttemptAt: { lte: new Date() }
      },
      data: { emailNextAttemptAt: addMinutes(new Date(), 5) }
    });
    if (!claimed.count) continue;

    try {
      await sendNotificationEmail(row.notification, row.user, config);
      const sentAt = new Date();
      await prisma.notificationRecipient.update({
        where: { id: row.id },
        data: {
          emailSentAt: sentAt,
          emailError: null,
          emailNextAttemptAt: null
        }
      });
      if (row.notification.type === NOTIFICATION_TYPES.DELIVERY && row.notification.trackingId) {
        await prisma.shipmentTracking.updateMany({
          where: { id: row.notification.trackingId },
          data: {
            emailNotificationSentAt: sentAt,
            emailNotificationError: null,
            emailNotificationNextAttemptAt: null
          }
        });
      }
      results.push({ id: row.id, success: true });
    } catch (error) {
      const attempts = Number(row.emailAttempts || 0) + 1;
      const nextAttemptAt = nextEmailAttemptDate(attempts);
      await prisma.notificationRecipient.update({
        where: { id: row.id },
        data: {
          emailAttempts: { increment: 1 },
          emailError: error.message,
          emailNextAttemptAt: nextAttemptAt
        }
      });
      if (row.notification.type === NOTIFICATION_TYPES.DELIVERY && row.notification.trackingId) {
        await prisma.shipmentTracking.updateMany({
          where: { id: row.notification.trackingId },
          data: {
            emailNotificationAttempts: { increment: 1 },
            emailNotificationError: error.message,
            emailNotificationNextAttemptAt: nextAttemptAt
          }
        });
      }
      results.push({ id: row.id, success: false, error: error.message });
    }
  }

  return results;
}

module.exports = {
  NOTIFICATION_TYPES,
  createNotification,
  notifyDelivery,
  notifyDelay,
  notifyDivergence,
  notifyTrackingFailure,
  notifyDeliveryProof,
  listNotifications,
  unreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  processPendingNotificationEmails
};
