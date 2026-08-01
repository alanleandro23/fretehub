const prisma = require('../db');
const { buildQuoteWorkbook } = require('../utils/excel');
const { buildQuotePdf } = require('../utils/pdf');
const { sendEmailMessage, uniqueEmails } = require('./email.service');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  return numberValue(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizeFormats(values) {
  const formats = [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => ['pdf', 'excel'].includes(value)))];
  if (!formats.length) throw new Error('Selecione PDF, Excel ou ambos para enviar.');
  return formats;
}

function proposalEmailBody(quote, customMessage = '') {
  const destination = [quote.cidadeDestino, quote.ufDestino].filter(Boolean).join(' / ') || '-';
  const intro = String(customMessage || '').trim() || 'Segue em anexo a proposta de frete solicitada.';
  const text = [
    intro,
    '',
    `Cotação: #${quote.id}`,
    `Destinatário: ${quote.razaoSocialDestinatario || quote.cnpjDestinatario || '-'}`,
    `Destino: ${destination}`,
    `Valor da mercadoria: ${money(quote.valorMercadoria)}`,
    '',
    'Atenciosamente,',
    quote.company?.nomeFantasia || quote.company?.razaoSocial || 'FreteHub'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#182536;line-height:1.55;max-width:680px">
      <p>${escapeHtml(intro).replace(/\n/g, '<br>')}</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0">
        <tr><td style="padding:9px;border-bottom:1px solid #e2e8f0"><strong>Cotação</strong></td><td style="padding:9px;border-bottom:1px solid #e2e8f0">#${quote.id}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e2e8f0"><strong>Destinatário</strong></td><td style="padding:9px;border-bottom:1px solid #e2e8f0">${escapeHtml(quote.razaoSocialDestinatario || quote.cnpjDestinatario || '-')}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e2e8f0"><strong>Destino</strong></td><td style="padding:9px;border-bottom:1px solid #e2e8f0">${escapeHtml(destination)}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e2e8f0"><strong>Valor da mercadoria</strong></td><td style="padding:9px;border-bottom:1px solid #e2e8f0">${escapeHtml(money(quote.valorMercadoria))}</td></tr>
      </table>
      <p>Os arquivos selecionados seguem anexos a este e-mail.</p>
      <p>Atenciosamente,<br><strong>${escapeHtml(quote.company?.nomeFantasia || quote.company?.razaoSocial || 'FreteHub')}</strong></p>
    </div>
  `;
  return { text, html };
}

async function buildProposalAttachments(quote, formats) {
  const attachments = [];
  if (formats.includes('excel')) {
    const workbook = await buildQuoteWorkbook(quote);
    const excel = Buffer.from(await workbook.xlsx.writeBuffer());
    attachments.push({
      filename: `cotacao-${quote.id}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: excel
    });
  }
  if (formats.includes('pdf')) {
    attachments.push({
      filename: `cotacao-${quote.id}.pdf`,
      contentType: 'application/pdf',
      content: await buildQuotePdf(quote)
    });
  }
  return attachments;
}

async function sendQuoteProposal({ quote, user, to, cc, subject, message, formats }) {
  const recipients = uniqueEmails(Array.isArray(to) ? to : String(to || '').split(/[;,]/));
  const copies = uniqueEmails(Array.isArray(cc) ? cc : String(cc || '').split(/[;,]/));
  if (!recipients.length) throw new Error('Informe ao menos um destinatário válido.');
  const normalizedFormats = normalizeFormats(formats);
  const normalizedSubject = String(subject || `Proposta de frete #${quote.id}`).trim();
  if (!normalizedSubject) throw new Error('Informe o assunto do e-mail.');

  const log = await prisma.quoteProposalLog.create({
    data: {
      quoteId: quote.id,
      userId: user.id,
      recipients,
      cc: copies.length ? copies : undefined,
      subject: normalizedSubject,
      message: String(message || '').trim() || null,
      formats: normalizedFormats,
      status: 'PENDING'
    }
  });

  try {
    const attachments = await buildProposalAttachments(quote, normalizedFormats);
    const body = proposalEmailBody(quote, message);
    const result = await sendEmailMessage({
      to: recipients,
      cc: copies,
      subject: normalizedSubject,
      ...body,
      attachments,
      metadata: { event: 'quote.proposal', quoteId: quote.id, proposalLogId: log.id }
    });
    return await prisma.quoteProposalLog.update({
      where: { id: log.id },
      data: {
        provider: result.provider || null,
        status: 'SENT',
        error: null,
        sentAt: new Date()
      },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
  } catch (error) {
    await prisma.quoteProposalLog.update({
      where: { id: log.id },
      data: { status: 'ERROR', error: String(error.message || error).slice(0, 3000) }
    });
    throw error;
  }
}

module.exports = { sendQuoteProposal, buildProposalAttachments, proposalEmailBody };
