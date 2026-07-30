const { getConfigValue } = require('./config.service');

function uniqueEmails(values = []) {
  return [...new Set(
    values
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
  )];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function trackingReference(tracking) {
  return tracking.numeroNota
    ? `NF ${tracking.numeroNota}`
    : tracking.numeroPedido
      ? `Pedido ${tracking.numeroPedido}`
      : tracking.conhecimento
        ? `CT-e ${tracking.conhecimento}`
        : `Tracking #${tracking.id}`;
}

function buildDeliveryMessage(tracking, config = {}) {
  const reference = trackingReference(tracking);
  const carrier = tracking.carrier?.nome || tracking.transportadora || 'Transportadora';
  const destination = [tracking.cidadeDestino, tracking.ufDestino].filter(Boolean).join(' / ') || 'não informado';
  const deliveredAt = tracking.dataEntrega
    ? new Date(tracking.dataEntrega).toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR');
  const appUrl = String(config.appUrl || '').replace(/\/$/, '');
  const trackingUrl = appUrl ? `${appUrl}/` : null;

  const subject = `Carga entregue — ${reference}`;
  const text = [
    'A entrega da carga foi confirmada.',
    '',
    `Referência: ${reference}`,
    `Transportadora: ${carrier}`,
    `Destino: ${destination}`,
    `Data da entrega: ${deliveredAt}`,
    trackingUrl ? `Acesse a plataforma: ${trackingUrl}` : null
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.5;max-width:640px">
      <h2 style="margin-bottom:8px">Carga entregue</h2>
      <p>A entrega da carga foi confirmada pelo monitoramento automático.</p>
      <table style="border-collapse:collapse;width:100%;margin:20px 0">
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Referência</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(reference)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Transportadora</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(carrier)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Destino</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(destination)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Data da entrega</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(deliveredAt)}</td></tr>
      </table>
      ${trackingUrl ? `<p><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;padding:10px 16px;background:#172033;color:#fff;text-decoration:none;border-radius:6px">Abrir FreteHub</a></p>` : ''}
    </div>
  `;

  return { subject, text, html };
}

async function readErrorResponse(response) {
  const text = await response.text().catch(() => '');
  if (!text) return `HTTP ${response.status}`;

  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.error || text;
  } catch {
    return text;
  }
}

async function sendViaWebhook({ to, subject, text, html, tracking, config }) {
  const response = await fetch(config.emailWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.emailWebhookToken
        ? { Authorization: `Bearer ${config.emailWebhookToken}` }
        : {})
    },
    body: JSON.stringify({
      event: 'shipment.delivered',
      to,
      from: config.emailFrom || 'FreteHub',
      subject,
      text,
      html,
      trackingId: tracking.id,
      metadata: {
        notaFiscal: tracking.numeroNota,
        pedido: tracking.numeroPedido,
        conhecimento: tracking.conhecimento,
        carrier: tracking.carrier?.nome || null,
        companyId: tracking.companyId
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Webhook de e-mail recusou o envio: ${await readErrorResponse(response)}`);
  }

  return { provider: 'webhook' };
}

async function sendViaResend({ to, subject, text, html, config }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: config.emailFrom || 'FreteHub <onboarding@resend.dev>',
      to,
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    throw new Error(`Provedor de e-mail recusou o envio: ${await readErrorResponse(response)}`);
  }

  return { provider: 'resend' };
}

async function loadEmailConfig() {
  const [enabled, emailFrom, appUrl, emailWebhookUrl, emailWebhookToken, resendApiKey] = await Promise.all([
    getConfigValue('EMAIL_NOTIFICATIONS_ENABLED', 'true'),
    getConfigValue('EMAIL_FROM', 'FreteHub'),
    getConfigValue('APP_URL', ''),
    getConfigValue('EMAIL_WEBHOOK_URL', ''),
    getConfigValue('EMAIL_WEBHOOK_TOKEN', ''),
    getConfigValue('RESEND_API_KEY', '')
  ]);

  return {
    enabled: String(enabled).trim().toLowerCase() !== 'false',
    emailFrom,
    appUrl,
    emailWebhookUrl,
    emailWebhookToken,
    resendApiKey
  };
}

async function sendDeliveryEmail(tracking) {
  const config = await loadEmailConfig();

  if (!config.enabled) {
    throw new Error('Notificações por e-mail estão desativadas.');
  }

  const to = uniqueEmails([
    tracking.user?.email,
    tracking.company?.email
  ]);

  if (!to.length) {
    throw new Error('Nenhum e-mail válido foi encontrado no usuário ou na empresa do tracking.');
  }

  const message = buildDeliveryMessage(tracking, config);

  if (config.emailWebhookUrl) {
    return {
      ...(await sendViaWebhook({ ...message, to, tracking, config })),
      recipients: to
    };
  }

  if (config.resendApiKey) {
    return {
      ...(await sendViaResend({ ...message, to, config })),
      recipients: to
    };
  }

  throw new Error('Envio de e-mail não configurado. Cadastre um webhook ou uma chave da Resend na área administrativa do Tracking.');
}

module.exports = {
  sendDeliveryEmail,
  uniqueEmails,
  buildDeliveryMessage,
  loadEmailConfig
};
