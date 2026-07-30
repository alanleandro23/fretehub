const prisma = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');

const TRACKING_INTERVAL_MINUTES = 60;

const PUBLIC_KEYS = [
  'JAMEF_TRACKING_URL',
  'BRASPRESS_TRACKING_URL',
  'EMAIL_NOTIFICATIONS_ENABLED',
  'EMAIL_FROM',
  'APP_URL',
  'EMAIL_WEBHOOK_URL'
];

const SECRET_KEYS = [
  'EMAIL_WEBHOOK_TOKEN',
  'RESEND_API_KEY'
];

function normalizeBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'true') return true;
  if (text === 'false') return false;
  return fallback;
}

function validateOptionalUrl(value, label) {
  const text = String(value || '').trim();
  if (!text) return '';

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} deve ser uma URL válida.`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} deve começar com http:// ou https://.`);
  }

  return text;
}

async function findSetting(key) {
  return prisma.systemSetting.findUnique({ where: { key } });
}

async function getConfigValue(key, fallback = '') {
  const row = await findSetting(key);
  if (row?.value != null) {
    return row.encrypted ? decrypt(row.value) : row.value;
  }

  return process.env[key] ?? fallback;
}

async function isConfigured(key) {
  return Boolean(String(await getConfigValue(key, '')).trim());
}

async function upsertSetting(key, value, userId, encrypted = false) {
  const normalized = value == null ? '' : String(value);
  const stored = encrypted && normalized ? encrypt(normalized) : normalized;

  return prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value: stored,
      encrypted,
      updatedById: userId || null
    },
    update: {
      value: stored,
      encrypted,
      updatedById: userId || null
    }
  });
}

async function deleteSetting(key) {
  await prisma.systemSetting.deleteMany({ where: { key } });
}

async function getTrackingAdminConfig() {
  const [
    jamefTrackingUrl,
    braspressTrackingUrl,
    emailEnabled,
    emailFrom,
    appUrl,
    emailWebhookUrl,
    emailWebhookTokenConfigured,
    resendApiKeyConfigured
  ] = await Promise.all([
    getConfigValue('JAMEF_TRACKING_URL', ''),
    getConfigValue('BRASPRESS_TRACKING_URL', ''),
    getConfigValue('EMAIL_NOTIFICATIONS_ENABLED', 'true'),
    getConfigValue('EMAIL_FROM', 'FreteHub'),
    getConfigValue('APP_URL', ''),
    getConfigValue('EMAIL_WEBHOOK_URL', ''),
    isConfigured('EMAIL_WEBHOOK_TOKEN'),
    isConfigured('RESEND_API_KEY')
  ]);

  return {
    intervalMinutes: TRACKING_INTERVAL_MINUTES,
    jamefTrackingUrl,
    braspressTrackingUrl,
    jamefTrackingConfigured: Boolean(String(jamefTrackingUrl).trim()),
    braspressTrackingConfigured: Boolean(String(braspressTrackingUrl).trim()),
    emailNotificationsEnabled: normalizeBoolean(emailEnabled, true),
    emailFrom,
    appUrl,
    emailWebhookUrl,
    emailWebhookTokenConfigured,
    resendApiKeyConfigured,
    emailProvider:
      String(emailWebhookUrl).trim()
        ? 'webhook'
        : resendApiKeyConfigured
          ? 'resend'
          : 'não configurado'
  };
}

async function updateTrackingAdminConfig(data = {}, user) {
  const userId = user?.id || null;

  const updates = {
    JAMEF_TRACKING_URL: validateOptionalUrl(data.jamefTrackingUrl, 'URL de tracking da Jamef'),
    BRASPRESS_TRACKING_URL: validateOptionalUrl(data.braspressTrackingUrl, 'URL de tracking da Braspress'),
    EMAIL_NOTIFICATIONS_ENABLED: String(normalizeBoolean(data.emailNotificationsEnabled, true)),
    EMAIL_FROM: String(data.emailFrom || '').trim(),
    APP_URL: validateOptionalUrl(data.appUrl, 'URL da plataforma'),
    EMAIL_WEBHOOK_URL: validateOptionalUrl(data.emailWebhookUrl, 'URL do webhook de e-mail')
  };

  await prisma.$transaction(
    Object.entries(updates).map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        create: { key, value, encrypted: false, updatedById: userId },
        update: { value, encrypted: false, updatedById: userId }
      })
    )
  );

  if (data.clearEmailWebhookToken === true) {
    await upsertSetting('EMAIL_WEBHOOK_TOKEN', '', userId, false);
  } else if (String(data.emailWebhookToken || '').trim()) {
    await upsertSetting('EMAIL_WEBHOOK_TOKEN', String(data.emailWebhookToken).trim(), userId, true);
  }

  if (data.clearResendApiKey === true) {
    await upsertSetting('RESEND_API_KEY', '', userId, false);
  } else if (String(data.resendApiKey || '').trim()) {
    await upsertSetting('RESEND_API_KEY', String(data.resendApiKey).trim(), userId, true);
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'UPDATE_TRACKING_CONFIG',
      entity: 'SystemSetting',
      payload: {
        changedKeys: [
          ...PUBLIC_KEYS,
          ...(String(data.emailWebhookToken || '').trim() || data.clearEmailWebhookToken ? ['EMAIL_WEBHOOK_TOKEN'] : []),
          ...(String(data.resendApiKey || '').trim() || data.clearResendApiKey ? ['RESEND_API_KEY'] : [])
        ]
      }
    }
  });

  return getTrackingAdminConfig();
}

module.exports = {
  TRACKING_INTERVAL_MINUTES,
  getConfigValue,
  getTrackingAdminConfig,
  updateTrackingAdminConfig
};
