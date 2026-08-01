const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');
const { getConfigValue } = require('./config.service');

function uniqueEmails(values = []) {
  return [...new Set(
    values
      .flat()
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

function normalizeAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .map((attachment, index) => {
      const filename = String(attachment?.filename || `anexo-${index + 1}`).replace(/[\r\n"]/g, '_');
      const content = Buffer.isBuffer(attachment?.content)
        ? attachment.content
        : attachment?.content instanceof Uint8Array
          ? Buffer.from(attachment.content)
          : Buffer.from(String(attachment?.content || ''), attachment?.encoding === 'base64' ? 'base64' : 'utf8');
      return {
        filename,
        content,
        contentType: String(attachment?.contentType || 'application/octet-stream')
      };
    })
    .filter((attachment) => attachment.content.length > 0);
}

function trackingReference(tracking) {
  return tracking?.numeroNota
    ? `NF ${tracking.numeroNota}`
    : tracking?.numeroPedido
      ? `Pedido ${tracking.numeroPedido}`
      : tracking?.conhecimento
        ? `CT-e ${tracking.conhecimento}`
        : `Tracking #${tracking?.id || '-'}`;
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

function notificationTypeLabel(type) {
  return ({
    DELIVERY: 'Entrega realizada',
    DELAY: 'Carga atrasada',
    TRACKING_FAILURE: 'Falha de consulta',
    DIVERGENCE: 'Divergência logística'
  })[type] || 'Notificação do FreteHub';
}

function buildNotificationMessage(notification, user, config = {}) {
  const appUrl = String(config.appUrl || '').replace(/\/$/, '');
  const trackingUrl = appUrl && notification.trackingId
    ? `${appUrl}/?tracking=${notification.trackingId}`
    : appUrl || null;
  const greeting = user?.name ? `Olá, ${user.name}.` : 'Olá.';
  const label = notificationTypeLabel(notification.type);

  const text = [
    greeting,
    '',
    notification.title,
    notification.message,
    '',
    trackingUrl ? `Acesse o FreteHub: ${trackingUrl}` : null
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.5;max-width:640px">
      <p>${escapeHtml(greeting)}</p>
      <div style="border-left:4px solid #0b4d85;padding:12px 16px;background:#f5f8fc">
        <small style="color:#52677c">${escapeHtml(label)}</small>
        <h2 style="margin:5px 0 8px">${escapeHtml(notification.title)}</h2>
        <p style="margin:0">${escapeHtml(notification.message)}</p>
      </div>
      ${trackingUrl ? `<p style="margin-top:20px"><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;padding:10px 16px;background:#0b4d85;color:#fff;text-decoration:none;border-radius:6px">Abrir FreteHub</a></p>` : ''}
    </div>
  `;

  return { subject: notification.title, text, html };
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

async function sendViaWebhook({ to, cc = [], subject, text, html, attachments = [], config, metadata = {} }) {
  const normalizedAttachments = normalizeAttachments(attachments);
  const response = await fetch(config.emailWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.emailWebhookToken
        ? { Authorization: `Bearer ${config.emailWebhookToken}` }
        : {})
    },
    body: JSON.stringify({
      event: metadata.event || 'fretehub.notification',
      to,
      cc,
      from: config.emailFrom || 'FreteHub',
      subject,
      text,
      html,
      attachments: normalizedAttachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: attachment.content.toString('base64')
      })),
      metadata
    })
  });

  if (!response.ok) {
    throw new Error(`Webhook de e-mail recusou o envio: ${await readErrorResponse(response)}`);
  }

  return { provider: 'webhook' };
}

async function sendViaResend({ to, cc = [], subject, text, html, attachments = [], config }) {
  const normalizedAttachments = normalizeAttachments(attachments);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: config.emailFrom || 'FreteHub <onboarding@resend.dev>',
      to,
      cc,
      subject,
      text,
      html,
      attachments: normalizedAttachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content.toString('base64')
      }))
    })
  });

  if (!response.ok) {
    throw new Error(`Provedor de e-mail recusou o envio: ${await readErrorResponse(response)}`);
  }

  return { provider: 'resend' };
}

function encodeHeader(value) {
  const text = String(value || '');
  return /^[\x20-\x7E]*$/.test(text)
    ? text
    : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function extractEmail(value) {
  const text = String(value || '').trim();
  const match = text.match(/<([^<>]+)>/);
  const email = (match ? match[1] : text).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Remetente SMTP inválido: ${text || 'não informado'}.`);
  }
  return email;
}

function createSmtpReader(socket) {
  let buffer = '';
  let current = [];
  const completed = [];
  const waiters = [];
  let disposed = false;

  function deliver(response) {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(response);
    else completed.push(response);
  }

  function rejectWaiters(error) {
    while (waiters.length) waiters.shift().reject(error);
  }

  function onData(chunk) {
    if (disposed) return;
    buffer += chunk.toString('utf8');
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n');
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      current.push(line);
      if (/^\d{3} /.test(line)) {
        const code = Number(line.slice(0, 3));
        deliver({ code, lines: current, text: current.join('\n') });
        current = [];
      }
    }
  }

  function onError(error) {
    rejectWaiters(error);
  }

  function onClose() {
    rejectWaiters(new Error('A conexão SMTP foi encerrada.'));
  }

  socket.on('data', onData);
  socket.on('error', onError);
  socket.on('close', onClose);

  function nextResponse(timeoutMs = 20000) {
    if (completed.length) return Promise.resolve(completed.shift());
    return new Promise((resolve, reject) => {
      let waiter = null;
      const timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error('Tempo limite excedido ao aguardar resposta do servidor SMTP.'));
      }, timeoutMs);

      waiter = {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        }
      };
      waiters.push(waiter);
    });
  }

  function dispose() {
    disposed = true;
    socket.off('data', onData);
    socket.off('error', onError);
    socket.off('close', onClose);
    rejectWaiters(new Error('Leitor SMTP substituído durante a negociação TLS.'));
  }

  return { nextResponse, dispose };
}

function writeCommand(socket, command) {
  socket.write(`${command}\r\n`);
}

function assertSmtp(response, expected, context) {
  const accepted = Array.isArray(expected) ? expected : [expected];
  if (!accepted.includes(response.code)) {
    throw new Error(`${context}: ${response.text || `SMTP ${response.code}`}`);
  }
}

async function connectSocket({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const options = { host, port, servername: host, rejectUnauthorized: true };
    const socket = secure ? tls.connect(options) : net.connect({ host, port });
    const event = secure ? 'secureConnect' : 'connect';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Tempo limite excedido ao conectar ao servidor SMTP.'));
    }, 20000);
    socket.once(event, () => {
      clearTimeout(timer);
      socket.setTimeout(30000, () => socket.destroy(new Error('Tempo limite da conexão SMTP excedido.')));
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function upgradeStartTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secured = tls.connect({ socket, servername: host, rejectUnauthorized: true });
    const timer = setTimeout(() => {
      secured.destroy();
      reject(new Error('Tempo limite excedido ao iniciar TLS no SMTP.'));
    }, 20000);
    secured.once('secureConnect', () => {
      clearTimeout(timer);
      resolve(secured);
    });
    secured.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function wrapBase64(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .match(/.{1,76}/g)?.join('\r\n') || '';
}

function resolveSmtpFrom(config, user) {
  const candidates = [config.smtpFrom, config.emailFrom, user]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      extractEmail(candidate);
      return candidate;
    } catch {
      // Tenta o próximo valor configurado.
    }
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(user || '').trim())) {
    return `FreteHub <${String(user).trim()}>`;
  }

  throw new Error('Configure um remetente SMTP válido, como FreteHub <conta@gmail.com>.');
}

function buildMimeMessage({ from, to, cc = [], subject, text, html, replyTo, attachments = [] }) {
  const normalizedAttachments = normalizeAttachments(attachments);
  const alternativeBoundary = `fretehub_alt_${crypto.randomBytes(12).toString('hex')}`;
  const mixedBoundary = `fretehub_mixed_${crypto.randomBytes(12).toString('hex')}`;
  const hasAttachments = normalizedAttachments.length > 0;
  const headers = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    cc.length ? `Cc: ${cc.join(', ')}` : null,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@fretehub.local>`,
    'MIME-Version: 1.0',
    hasAttachments
      ? `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`
      : `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`
  ].filter(Boolean);

  const alternativeParts = [
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(text),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(html),
    `--${alternativeBoundary}--`,
    ''
  ];

  const message = hasAttachments
    ? [
        ...headers,
        '',
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
        '',
        ...alternativeParts,
        ...normalizedAttachments.flatMap((attachment) => [
          `--${mixedBoundary}`,
          `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: attachment; filename="${attachment.filename}"`,
          '',
          attachment.content.toString('base64').match(/.{1,76}/g)?.join('\r\n') || '',
          ''
        ]),
        `--${mixedBoundary}--`,
        ''
      ].join('\r\n')
    : [...headers, '', ...alternativeParts].join('\r\n');

  return message.replace(/(^|\r\n)\./g, '$1..');
}

async function sendViaSmtp({ to, cc = [], subject, text, html, attachments = [], config }) {
  const toRecipients = uniqueEmails(to);
  const ccRecipients = uniqueEmails(cc);
  const recipients = uniqueEmails([toRecipients, ccRecipients]);
  if (!toRecipients.length) throw new Error('Nenhum destinatário principal válido para o SMTP.');

  const host = String(config.smtpHost || '').trim();
  const port = Number(config.smtpPort || (config.smtpSecure ? 465 : 587));
  const user = String(config.smtpUser || '').trim();
  const password = String(config.smtpPassword || '').replace(/\s+/g, '');
  const from = resolveSmtpFrom(config, user);
  const envelopeFrom = extractEmail(from);
  const replyTo = String(config.smtpReplyTo || '').trim();
  if (replyTo) extractEmail(replyTo);

  if (!host || !port || !user || !password) {
    throw new Error('SMTP incompleto. Informe servidor, porta, usuário e senha de aplicativo.');
  }

  let socket = null;
  let reader = null;
  let completed = false;

  try {
    socket = await connectSocket({ host, port, secure: Boolean(config.smtpSecure) });
    reader = createSmtpReader(socket);
    assertSmtp(await reader.nextResponse(), 220, 'Servidor SMTP não aceitou a conexão');

    writeCommand(socket, 'EHLO fretehub.local');
    let ehlo = await reader.nextResponse();
    assertSmtp(ehlo, 250, 'Falha no EHLO SMTP');

    if (!config.smtpSecure) {
      if (!ehlo.text.toUpperCase().includes('STARTTLS')) {
        throw new Error('O servidor SMTP não anunciou suporte a STARTTLS.');
      }
      writeCommand(socket, 'STARTTLS');
      assertSmtp(await reader.nextResponse(), 220, 'Servidor SMTP recusou STARTTLS');
      reader.dispose();
      socket.setTimeout(0);
      socket = await upgradeStartTls(socket, host);
      socket.setTimeout(30000, () => socket.destroy(new Error('Tempo limite da conexão SMTP excedido.')));
      reader = createSmtpReader(socket);
      writeCommand(socket, 'EHLO fretehub.local');
      ehlo = await reader.nextResponse();
      assertSmtp(ehlo, 250, 'Falha no EHLO após STARTTLS');
    }

    writeCommand(socket, 'AUTH LOGIN');
    assertSmtp(await reader.nextResponse(), 334, 'Servidor SMTP recusou autenticação');
    writeCommand(socket, Buffer.from(user, 'utf8').toString('base64'));
    assertSmtp(await reader.nextResponse(), 334, 'Servidor SMTP recusou o usuário');
    writeCommand(socket, Buffer.from(password, 'utf8').toString('base64'));
    assertSmtp(await reader.nextResponse(), 235, 'Servidor SMTP recusou a senha de aplicativo');

    writeCommand(socket, `MAIL FROM:<${envelopeFrom}>`);
    assertSmtp(await reader.nextResponse(), 250, 'Servidor SMTP recusou o remetente');

    for (const recipient of recipients) {
      writeCommand(socket, `RCPT TO:<${recipient}>`);
      assertSmtp(await reader.nextResponse(), [250, 251], `Servidor SMTP recusou o destinatário ${recipient}`);
    }

    writeCommand(socket, 'DATA');
    assertSmtp(await reader.nextResponse(), 354, 'Servidor SMTP recusou o conteúdo do e-mail');
    const mime = buildMimeMessage({
      from,
      to: toRecipients,
      cc: ccRecipients,
      subject,
      text,
      html,
      replyTo,
      attachments
    });
    socket.write(`${mime}\r\n.\r\n`);
    assertSmtp(await reader.nextResponse(), 250, 'Servidor SMTP não confirmou o envio');

    writeCommand(socket, 'QUIT');
    await reader.nextResponse().catch(() => null);
    socket.end();
    completed = true;

    return { provider: 'smtp' };
  } finally {
    if (!completed && socket && !socket.destroyed) socket.destroy();
  }
}

async function loadEmailConfig() {
  const [
    enabled,
    emailProvider,
    emailFrom,
    appUrl,
    emailWebhookUrl,
    emailWebhookToken,
    resendApiKey,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
    smtpFrom,
    smtpReplyTo
  ] = await Promise.all([
    getConfigValue('EMAIL_NOTIFICATIONS_ENABLED', 'true'),
    getConfigValue('EMAIL_PROVIDER', ''),
    getConfigValue('EMAIL_FROM', 'FreteHub'),
    getConfigValue('APP_URL', ''),
    getConfigValue('EMAIL_WEBHOOK_URL', ''),
    getConfigValue('EMAIL_WEBHOOK_TOKEN', ''),
    getConfigValue('RESEND_API_KEY', ''),
    getConfigValue('SMTP_HOST', ''),
    getConfigValue('SMTP_PORT', '587'),
    getConfigValue('SMTP_SECURE', 'false'),
    getConfigValue('SMTP_USER', ''),
    getConfigValue('SMTP_PASSWORD', ''),
    getConfigValue('SMTP_FROM', ''),
    getConfigValue('SMTP_REPLY_TO', '')
  ]);

  const smtpConfigured = Boolean(String(smtpHost).trim() && String(smtpUser).trim() && String(smtpPassword).trim());
  const requestedProvider = String(emailProvider || '').trim().toLowerCase();
  const provider = requestedProvider || (
    smtpConfigured ? 'smtp' :
      String(emailWebhookUrl).trim() ? 'webhook' :
        String(resendApiKey).trim() ? 'resend' : 'none'
  );

  return {
    enabled: String(enabled).trim().toLowerCase() !== 'false',
    provider,
    emailFrom,
    appUrl,
    emailWebhookUrl,
    emailWebhookToken,
    resendApiKey,
    smtpHost,
    smtpPort: Number(smtpPort || 587),
    smtpSecure: String(smtpSecure).trim().toLowerCase() === 'true',
    smtpUser,
    smtpPassword,
    smtpFrom: smtpFrom || emailFrom,
    smtpReplyTo,
    smtpConfigured
  };
}

async function sendEmailMessage({ to, cc = [], subject, text, html, attachments = [], metadata = {}, config: providedConfig = null }) {
  const config = providedConfig || await loadEmailConfig();
  if (!config.enabled) throw new Error('Notificações por e-mail estão desativadas.');

  const recipients = uniqueEmails(to);
  const copyRecipients = uniqueEmails(cc);
  if (!recipients.length) throw new Error('Nenhum e-mail principal válido foi informado.');

  if (config.provider === 'smtp') {
    return { ...(await sendViaSmtp({ to: recipients, cc: copyRecipients, subject, text, html, attachments, config })), recipients, cc: copyRecipients };
  }
  if (config.provider === 'webhook' && config.emailWebhookUrl) {
    return { ...(await sendViaWebhook({ to: recipients, cc: copyRecipients, subject, text, html, attachments, config, metadata })), recipients, cc: copyRecipients };
  }
  if (config.provider === 'resend' && config.resendApiKey) {
    return { ...(await sendViaResend({ to: recipients, cc: copyRecipients, subject, text, html, attachments, config })), recipients, cc: copyRecipients };
  }

  throw new Error('Envio de e-mail não configurado. Configure Gmail/SMTP, webhook ou Resend.');
}

async function sendDeliveryEmail(tracking) {
  const config = await loadEmailConfig();
  const to = uniqueEmails([tracking.user?.email, tracking.company?.email]);
  if (!to.length) {
    throw new Error('Nenhum e-mail válido foi encontrado no usuário ou na empresa do tracking.');
  }
  const message = buildDeliveryMessage(tracking, config);
  return sendEmailMessage({
    ...message,
    to,
    config,
    metadata: { event: 'shipment.delivered', trackingId: tracking.id }
  });
}

async function sendNotificationEmail(notification, user, providedConfig = null) {
  const config = providedConfig || await loadEmailConfig();
  const message = buildNotificationMessage(notification, user, config);
  return sendEmailMessage({
    ...message,
    to: [user.email],
    config,
    metadata: {
      event: `notification.${String(notification.type || 'generic').toLowerCase()}`,
      notificationId: notification.id,
      trackingId: notification.trackingId || null
    }
  });
}

async function sendTestEmail(to, requestedBy = null) {
  const config = await loadEmailConfig();
  const recipient = uniqueEmails([to]);
  if (!recipient.length) throw new Error('Informe um e-mail válido para o teste.');
  const now = new Date().toLocaleString('pt-BR');
  const subject = 'Teste de e-mail — FreteHub';
  const text = `O envio de e-mail do FreteHub está funcionando.\n\nData do teste: ${now}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#172033"><h2>Teste concluído</h2><p>O envio de e-mail do FreteHub está funcionando.</p><p><strong>Data:</strong> ${escapeHtml(now)}</p></div>`;
  return sendEmailMessage({
    to: recipient,
    subject,
    text,
    html,
    config: { ...config, enabled: true },
    metadata: { event: 'email.test', requestedBy: requestedBy?.id || null }
  });
}

module.exports = {
  sendDeliveryEmail,
  sendNotificationEmail,
  sendTestEmail,
  sendEmailMessage,
  uniqueEmails,
  buildDeliveryMessage,
  buildNotificationMessage,
  loadEmailConfig,
  normalizeAttachments
};
