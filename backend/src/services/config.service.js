const prisma = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');

const TRACKING_INTERVAL_MINUTES = 60;

const PUBLIC_KEYS = [
  'JAMEF_TRACKING_URL',
  'BRASPRESS_TRACKING_URL',
  'CAMILO_TRACKING_URL',
  'EMAIL_NOTIFICATIONS_ENABLED',
  'EMAIL_FROM',
  'APP_URL',
  'EMAIL_WEBHOOK_URL',
  'EMAIL_PROVIDER',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_FROM',
  'SMTP_REPLY_TO'
];

const SECRET_KEYS = [
  'EMAIL_WEBHOOK_TOKEN',
  'RESEND_API_KEY',
  'SMTP_PASSWORD'
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
    camiloTrackingUrl,
    emailEnabled,
    emailProvider,
    emailFrom,
    appUrl,
    emailWebhookUrl,
    emailWebhookTokenConfigured,
    resendApiKeyConfigured,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpFrom,
    smtpReplyTo,
    smtpPasswordConfigured
  ] = await Promise.all([
    getConfigValue('JAMEF_TRACKING_URL', ''),
    getConfigValue('BRASPRESS_TRACKING_URL', ''),
    getConfigValue('CAMILO_TRACKING_URL', 'https://ssw.inf.br/2/ssw_resultSSW'),
    getConfigValue('EMAIL_NOTIFICATIONS_ENABLED', 'true'),
    getConfigValue('EMAIL_PROVIDER', ''),
    getConfigValue('EMAIL_FROM', 'FreteHub'),
    getConfigValue('APP_URL', ''),
    getConfigValue('EMAIL_WEBHOOK_URL', ''),
    isConfigured('EMAIL_WEBHOOK_TOKEN'),
    isConfigured('RESEND_API_KEY'),
    getConfigValue('SMTP_HOST', 'smtp.gmail.com'),
    getConfigValue('SMTP_PORT', '587'),
    getConfigValue('SMTP_SECURE', 'false'),
    getConfigValue('SMTP_USER', ''),
    getConfigValue('SMTP_FROM', ''),
    getConfigValue('SMTP_REPLY_TO', ''),
    isConfigured('SMTP_PASSWORD')
  ]);

  const provider = String(emailProvider || '').trim().toLowerCase() || (
    smtpPasswordConfigured && String(smtpHost).trim() && String(smtpUser).trim()
      ? 'smtp'
      : String(emailWebhookUrl).trim()
        ? 'webhook'
        : resendApiKeyConfigured
          ? 'resend'
          : 'none'
  );

  return {
    intervalMinutes: TRACKING_INTERVAL_MINUTES,
    jamefTrackingUrl,
    braspressTrackingUrl,
    camiloTrackingUrl,
    jamefTrackingConfigured: Boolean(String(jamefTrackingUrl).trim()),
    braspressTrackingConfigured: Boolean(String(braspressTrackingUrl).trim()),
    camiloTrackingConfigured: Boolean(String(camiloTrackingUrl).trim()),
    emailNotificationsEnabled: normalizeBoolean(emailEnabled, true),
    emailProvider: provider,
    emailFrom,
    appUrl,
    emailWebhookUrl,
    emailWebhookTokenConfigured,
    resendApiKeyConfigured,
    smtpHost,
    smtpPort: Number(smtpPort || 587),
    smtpSecure: normalizeBoolean(smtpSecure, false),
    smtpUser,
    smtpFrom,
    smtpReplyTo,
    smtpPasswordConfigured,
    smtpConfigured: Boolean(
      String(smtpHost).trim() &&
      String(smtpUser).trim() &&
      smtpPasswordConfigured
    )
  };
}

async function updateTrackingAdminConfig(data = {}, user) {
  const userId = user?.id || null;
  const provider = String(data.emailProvider || 'none').trim().toLowerCase();
  if (!['none', 'smtp', 'webhook', 'resend'].includes(provider)) {
    throw new Error('Provedor de e-mail inválido.');
  }

  const smtpPort = Number(data.smtpPort || 587);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    throw new Error('Porta SMTP inválida.');
  }

  const updates = {
    JAMEF_TRACKING_URL: validateOptionalUrl(data.jamefTrackingUrl, 'URL de tracking da Jamef'),
    BRASPRESS_TRACKING_URL: validateOptionalUrl(data.braspressTrackingUrl, 'URL de tracking da Braspress'),
    CAMILO_TRACKING_URL: validateOptionalUrl(data.camiloTrackingUrl, 'URL de tracking da Camilo/SSW'),
    EMAIL_NOTIFICATIONS_ENABLED: String(normalizeBoolean(data.emailNotificationsEnabled, true)),
    EMAIL_PROVIDER: provider,
    EMAIL_FROM: String(data.emailFrom || '').trim(),
    APP_URL: validateOptionalUrl(data.appUrl, 'URL da plataforma'),
    EMAIL_WEBHOOK_URL: validateOptionalUrl(data.emailWebhookUrl, 'URL do webhook de e-mail'),
    SMTP_HOST: String(data.smtpHost || '').trim(),
    SMTP_PORT: String(smtpPort),
    SMTP_SECURE: String(normalizeBoolean(data.smtpSecure, false)),
    SMTP_USER: String(data.smtpUser || '').trim(),
    SMTP_FROM: String(data.smtpFrom || '').trim(),
    SMTP_REPLY_TO: String(data.smtpReplyTo || '').trim()
  };

  if (provider === 'smtp') {
    if (!updates.SMTP_HOST) throw new Error('Informe o servidor SMTP.');
    if (!updates.SMTP_USER) throw new Error('Informe o usuário SMTP.');

    const passwordConfigured = await isConfigured('SMTP_PASSWORD');
    const newPassword = String(data.smtpPassword || '').replace(/\s+/g, '');

    if (data.clearSmtpPassword === true && !newPassword) {
      throw new Error('Não é possível remover a senha SMTP enquanto o provedor Gmail/SMTP estiver selecionado.');
    }

    if (!passwordConfigured && !newPassword) {
      throw new Error('Informe a senha de aplicativo do SMTP.');
    }
  }

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

  if (data.clearSmtpPassword === true) {
    await upsertSetting('SMTP_PASSWORD', '', userId, false);
  } else if (String(data.smtpPassword || '').trim()) {
    await upsertSetting(
      'SMTP_PASSWORD',
      String(data.smtpPassword).replace(/\s+/g, ''),
      userId,
      true
    );
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
          ...(String(data.resendApiKey || '').trim() || data.clearResendApiKey ? ['RESEND_API_KEY'] : []),
          ...(String(data.smtpPassword || '').trim() || data.clearSmtpPassword ? ['SMTP_PASSWORD'] : [])
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
