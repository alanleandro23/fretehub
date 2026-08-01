const { chromium } = require('playwright');
const { loadCompanyLogo } = require('./branding');

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

function formatDocument(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return value || '-';
}

function deadlineScore(value, createdAt) {
  const text = String(value || '').trim();
  const dateMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dateMatch) {
    const deadline = new Date(Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1]));
    const start = new Date(createdAt || Date.now());
    start.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((deadline - start) / 86400000));
  }
  const number = Number(text.match(/\d+/)?.[0]);
  return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER;
}

function dimensions(item) {
  const cm = (value) => (numberValue(value) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return `${cm(item.comprimento)} × ${cm(item.largura)} × ${cm(item.altura)} cm`;
}

function successfulResults(quote) {
  return (quote.results || []).filter((result) => result.status === 'success' && result.valorFrete != null);
}

async function proposalHtml(quote) {
  const companyName = quote.company?.nomeFantasia || quote.company?.razaoSocial || 'FreteHub';
  let logoDataUri = null;
  try {
    logoDataUri = (await loadCompanyLogo(quote.company))?.dataUri || null;
  } catch (error) {
    console.warn('PDF: logomarca não carregada:', error.message);
  }

  const successful = successfulResults(quote);
  const minPrice = successful.length ? Math.min(...successful.map((result) => numberValue(result.valorFrete))) : null;
  const minDeadline = successful.length ? Math.min(...successful.map((result) => deadlineScore(result.prazo, quote.createdAt))) : null;

  const resultRows = (quote.results || []).map((result) => {
    const success = result.status === 'success' && result.valorFrete != null;
    const bestPrice = success && numberValue(result.valorFrete) === minPrice;
    const bestDeadline = success && deadlineScore(result.prazo, quote.createdAt) === minDeadline;
    const classes = [success ? 'success' : 'error', bestPrice || bestDeadline ? 'best' : ''].filter(Boolean).join(' ');
    const tags = [bestPrice ? '<span>Menor preço</span>' : '', bestDeadline ? '<span>Menor prazo</span>' : ''].join('');
    return `<tr class="${classes}">
      <td><strong>${escapeHtml(result.carrier?.nome || '-')}</strong><div class="tags">${tags}</div></td>
      <td class="money">${result.valorFrete == null ? '-' : escapeHtml(money(result.valorFrete))}</td>
      <td>${escapeHtml(result.prazo || '-')}</td>
      <td>${escapeHtml(result.modalidade || '-')}</td>
      <td>${success ? 'Cotado' : 'Erro'}</td>
      <td>${escapeHtml(result.mensagem || '-')}</td>
    </tr>`;
  }).join('');

  const itemRows = (quote.items || []).map((item) => {
    const quantity = Math.max(1, Math.trunc(numberValue(item.quantidade, 1)));
    return `<tr>
      <td>${escapeHtml(item.descricao || item.product?.description || item.sku || '-')}</td>
      <td>${escapeHtml(dimensions(item))}</td>
      <td>${numberValue(item.peso).toLocaleString('pt-BR')} kg</td>
      <td>${quantity}</td>
      <td>${numberValue(item.cubagem).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} m³</td>
      <td>${(numberValue(item.peso) * quantity).toLocaleString('pt-BR')} kg</td>
    </tr>`;
  }).join('');

  return `<!doctype html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <style>
      @page{size:A4 landscape;margin:12mm}
      *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#182536;font-size:11px}
      header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-bottom:14px;border-bottom:3px solid #0b4d85}
      .brand{display:flex;align-items:center;gap:14px;min-width:260px}.brand img{max-width:170px;max-height:65px;object-fit:contain}.brand-name{font-size:23px;font-weight:800;color:#0b4d85}
      .title{text-align:right}.title h1{margin:0;color:#0b3358;font-size:24px}.title p{margin:7px 0 0;color:#64748b}
      h2{font-size:13px;color:#fff;background:#0b3358;padding:8px 10px;margin:18px 0 0}
      .meta{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #d7e1ec;border-top:0}.meta div{padding:9px;border-right:1px solid #d7e1ec;border-bottom:1px solid #d7e1ec;min-height:48px}.meta div:nth-child(4n){border-right:0}.meta small{display:block;color:#64748b;margin-bottom:4px}.meta strong{overflow-wrap:anywhere}
      table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #d7e1ec;padding:8px;vertical-align:top;overflow-wrap:anywhere}th{background:#eef5fb;color:#0b3358;text-align:left}tr.success td{background:#fbfdff}tr.error td{background:#fdecec;color:#8d1c14}tr.best td{background:#e8f8ef}.money{text-align:right;white-space:nowrap}.tags span{display:inline-block;margin:5px 4px 0 0;padding:3px 6px;border-radius:999px;background:#dff8e8;color:#11723b;font-size:9px;font-weight:700}
      .note{margin-top:16px;padding:10px;border:1px solid #d7e1ec;background:#f8fbff;color:#52677c;line-height:1.5}
      footer{margin-top:12px;text-align:right;color:#7b8a9b;font-size:9px}
    </style>
  </head>
  <body>
    <header>
      <div class="brand">${logoDataUri ? `<img src="${logoDataUri}" alt="Logomarca">` : `<div class="brand-name">${escapeHtml(companyName)}</div>`}</div>
      <div class="title"><h1>Proposta de frete</h1><p>Cotação #${quote.id} · ${new Date(quote.createdAt).toLocaleString('pt-BR')}</p></div>
    </header>
    <h2>Dados da cotação</h2>
    <div class="meta">
      <div><small>Empresa remetente</small><strong>${escapeHtml(companyName)}</strong></div>
      <div><small>CNPJ remetente</small><strong>${escapeHtml(formatDocument(quote.company?.cnpj))}</strong></div>
      <div><small>Responsável</small><strong>${escapeHtml(quote.user?.name || '-')}</strong></div>
      <div><small>Tipo / Modal</small><strong>${escapeHtml(`${quote.tipoFrete || '-'} / ${quote.modal || '-'}`)}</strong></div>
      <div><small>Destinatário</small><strong>${escapeHtml(quote.razaoSocialDestinatario || '-')}</strong></div>
      <div><small>Documento</small><strong>${escapeHtml(formatDocument(quote.cnpjDestinatario))}</strong></div>
      <div><small>Destino</small><strong>${escapeHtml(`${quote.cidadeDestino || '-'} / ${quote.ufDestino || '-'}`)}</strong></div>
      <div><small>CEP</small><strong>${escapeHtml(quote.cepDestino || '-')}</strong></div>
      <div><small>Valor da mercadoria</small><strong>${escapeHtml(money(quote.valorMercadoria))}</strong></div>
      <div><small>Peso total</small><strong>${numberValue(quote.pesoTotal).toLocaleString('pt-BR')} kg</strong></div>
      <div><small>Volumes</small><strong>${quote.quantidadeVolumes || 0}</strong></div>
      <div><small>Data da proposta</small><strong>${new Date(quote.createdAt).toLocaleDateString('pt-BR')}</strong></div>
    </div>
    <h2>Resultados das transportadoras</h2>
    <table><thead><tr><th style="width:18%">Transportadora</th><th style="width:12%">Valor</th><th style="width:12%">Prazo</th><th style="width:12%">Modalidade</th><th style="width:10%">Status</th><th>Mensagem / restrição</th></tr></thead><tbody>${resultRows || '<tr><td colspan="6">Nenhum resultado disponível.</td></tr>'}</tbody></table>
    <h2>Produtos e volumes</h2>
    <table><thead><tr><th>Descrição</th><th>Dimensões</th><th>Peso unitário</th><th>Quantidade</th><th>Cubagem</th><th>Peso total</th></tr></thead><tbody>${itemRows || '<tr><td colspan="6">Nenhum item disponível.</td></tr>'}</tbody></table>
    <div class="note">Esta proposta apresenta os resultados retornados pelas transportadoras no momento da cotação. Valores e prazos podem sofrer alterações após conferência dos dados e conforme as regras contratuais de cada transportadora.</div>
    <footer>Documento gerado pelo FreteHub.</footer>
  </body></html>`;
}

async function buildQuotePdf(quote) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(await proposalHtml(quote), { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });
  } catch (error) {
    if (/executable|browserType\.launch/i.test(String(error.message))) {
      throw new Error('O gerador de PDF precisa do Chromium do Playwright. Execute no backend: npx.cmd playwright install chromium');
    }
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { buildQuotePdf, proposalHtml };
