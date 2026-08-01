const ExcelJS = require('exceljs');
const { loadCompanyLogo } = require('./branding');

const COLORS = Object.freeze({
  navy: 'FF0B3358',
  blue: 'FF0B4D85',
  paleBlue: 'FFEEF5FB',
  lightBlue: 'FFF7FBFF',
  green: 'FFE8F8EF',
  greenText: 'FF14783C',
  amber: 'FFFFF7DF',
  amberText: 'FF946200',
  red: 'FFFDECEC',
  redText: 'FFB42318',
  border: 'FFD7E1EC',
  text: 'FF182536',
  muted: 'FF64748B',
  white: 'FFFFFFFF'
});

function formatDocument(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return value || '-';
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return numberValue(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function dimensions(item) {
  const cm = (value) => {
    const number = numberValue(value) * 100;
    return number.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  };
  return `${cm(item.comprimento)} × ${cm(item.largura)} × ${cm(item.altura)} cm`;
}

function successfulResults(quote) {
  return (quote.results || []).filter((result) => result.status === 'success' && result.valorFrete != null);
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

function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } }
  };
}

function fill(cell, argb) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function styleCell(cell, options = {}) {
  cell.font = {
    name: 'Arial',
    size: options.size || 10,
    bold: Boolean(options.bold),
    color: { argb: options.color || COLORS.text }
  };
  cell.alignment = {
    vertical: options.vertical || 'middle',
    horizontal: options.horizontal || 'left',
    wrapText: true
  };
  if (options.border !== false) cell.border = thinBorder();
  if (options.fill) fill(cell, options.fill);
  if (options.numFmt) cell.numFmt = options.numFmt;
}

function setMergedValue(sheet, range, value, options = {}) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(':')[0]);
  cell.value = value;
  styleCell(cell, { border: options.border ?? false, ...options });
  return cell;
}

function styleRow(sheet, rowNumber, fromColumn, toColumn, options = {}) {
  for (let column = fromColumn; column <= toColumn; column += 1) {
    styleCell(sheet.getRow(rowNumber).getCell(column), options);
  }
}

async function addBranding(workbook, sheet, quote) {
  const companyName = quote.company?.nomeFantasia || quote.company?.razaoSocial || 'FreteHub';
  let logo = null;
  try {
    logo = await loadCompanyLogo(quote.company);
  } catch (error) {
    console.warn('Excel: logomarca não carregada:', error.message);
  }

  if (logo) {
    const imageId = workbook.addImage({ buffer: logo.buffer, extension: logo.extension });
    sheet.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 150, height: 58 } });
  } else {
    setMergedValue(sheet, 'A1:B2', companyName, {
      bold: true,
      size: 18,
      color: COLORS.blue,
      vertical: 'middle'
    });
  }

  setMergedValue(sheet, 'C1:F1', 'PROPOSTA DE FRETE', {
    bold: true,
    size: 18,
    color: COLORS.white,
    fill: COLORS.blue,
    horizontal: 'center',
    vertical: 'middle',
    border: true
  });
  setMergedValue(sheet, 'C2:F2', `Cotação #${quote.id} · ${dateTime(quote.createdAt)}`, {
    bold: true,
    color: COLORS.navy,
    fill: COLORS.paleBlue,
    horizontal: 'center',
    border: true
  });
  sheet.getRow(1).height = 34;
  sheet.getRow(2).height = 25;
}

async function buildQuoteWorkbook(quote) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FreteHub';
  workbook.company = quote.company?.razaoSocial || 'FreteHub';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Proposta', { views: [{ showGridLines: false }] });
  sheet.columns = [
    { width: 27 }, { width: 24 }, { width: 20 },
    { width: 20 }, { width: 19 }, { width: 36 }
  ];

  await addBranding(workbook, sheet, quote);

  setMergedValue(sheet, 'A4:F4', 'DADOS DA COTAÇÃO', {
    bold: true, color: COLORS.white, fill: COLORS.navy, horizontal: 'left', border: true
  });

  const metadata = [
    ['Empresa remetente', quote.company?.nomeFantasia || quote.company?.razaoSocial || '-'],
    ['CNPJ remetente', formatDocument(quote.company?.cnpj)],
    ['Responsável', quote.user?.name || '-'],
    ['Tipo / Modal', `${quote.tipoFrete || '-'} / ${quote.modal || '-'}`],
    ['Destinatário', quote.razaoSocialDestinatario || '-'],
    ['Documento destinatário', formatDocument(quote.cnpjDestinatario)],
    ['Destino', `${quote.cidadeDestino || '-'} / ${quote.ufDestino || '-'}`],
    ['CEP destino', quote.cepDestino || '-'],
    ['Valor da mercadoria', money(quote.valorMercadoria)],
    ['Peso / Volumes', `${numberValue(quote.pesoTotal).toLocaleString('pt-BR')} kg / ${quote.quantidadeVolumes || 0}`]
  ];

  let row = 5;
  for (let index = 0; index < metadata.length; index += 2) {
    const first = metadata[index];
    const second = metadata[index + 1];
    sheet.getRow(row).values = [first[0], first[1], '', second[0], second[1], ''];
    sheet.mergeCells(row, 2, row, 3);
    sheet.mergeCells(row, 5, row, 6);
    styleCell(sheet.getCell(row, 1), { bold: true, fill: COLORS.paleBlue });
    styleCell(sheet.getCell(row, 2));
    styleCell(sheet.getCell(row, 4), { bold: true, fill: COLORS.paleBlue });
    styleCell(sheet.getCell(row, 5));
    row += 1;
  }

  row += 1;
  setMergedValue(sheet, `A${row}:F${row}`, 'RESULTADOS DAS TRANSPORTADORAS', {
    bold: true, color: COLORS.white, fill: COLORS.navy, border: true
  });
  row += 1;
  sheet.getRow(row).values = ['Transportadora', 'Valor', 'Prazo', 'Modalidade', 'Status', 'Mensagem / restrição'];
  styleRow(sheet, row, 1, 6, { bold: true, fill: COLORS.paleBlue, color: COLORS.navy, horizontal: 'center' });

  const successful = successfulResults(quote);
  const minPrice = successful.length ? Math.min(...successful.map((result) => numberValue(result.valorFrete))) : null;
  const minDeadline = successful.length ? Math.min(...successful.map((result) => deadlineScore(result.prazo, quote.createdAt))) : null;

  for (const result of quote.results || []) {
    row += 1;
    const isSuccess = result.status === 'success' && result.valorFrete != null;
    const bestPrice = isSuccess && numberValue(result.valorFrete) === minPrice;
    const bestDeadline = isSuccess && deadlineScore(result.prazo, quote.createdAt) === minDeadline;
    const tags = [bestPrice ? 'Menor preço' : null, bestDeadline ? 'Menor prazo' : null].filter(Boolean).join(' · ');
    sheet.getRow(row).values = [
      result.carrier?.nome || '-',
      result.valorFrete == null ? '-' : numberValue(result.valorFrete),
      result.prazo || '-',
      result.modalidade || '-',
      isSuccess ? (tags || 'Cotado') : 'Erro',
      result.mensagem || '-'
    ];
    const rowFill = isSuccess ? (bestPrice || bestDeadline ? COLORS.green : COLORS.lightBlue) : COLORS.red;
    styleRow(sheet, row, 1, 6, { fill: rowFill });
    if (result.valorFrete != null) sheet.getCell(row, 2).numFmt = 'R$ #,##0.00';
    styleCell(sheet.getCell(row, 2), { fill: rowFill, horizontal: 'right', numFmt: result.valorFrete != null ? 'R$ #,##0.00' : undefined });
    styleCell(sheet.getCell(row, 3), { fill: rowFill, horizontal: 'center' });
    styleCell(sheet.getCell(row, 4), { fill: rowFill, horizontal: 'center' });
    styleCell(sheet.getCell(row, 5), { fill: rowFill, bold: true, color: isSuccess ? COLORS.greenText : COLORS.redText, horizontal: 'center' });
  }

  if (!(quote.results || []).length) {
    row += 1;
    setMergedValue(sheet, `A${row}:F${row}`, 'Nenhum resultado disponível.', { fill: COLORS.red, color: COLORS.redText, border: true });
  }

  row += 2;
  setMergedValue(sheet, `A${row}:F${row}`, 'PRODUTOS E VOLUMES', {
    bold: true, color: COLORS.white, fill: COLORS.navy, border: true
  });
  row += 1;
  sheet.getRow(row).values = ['Descrição', 'Dimensões', 'Peso unitário', 'Quantidade', 'Cubagem', 'Peso total'];
  styleRow(sheet, row, 1, 6, { bold: true, fill: COLORS.paleBlue, color: COLORS.navy, horizontal: 'center' });

  for (const item of quote.items || []) {
    row += 1;
    const quantity = Math.max(1, Math.trunc(numberValue(item.quantidade, 1)));
    sheet.getRow(row).values = [
      item.descricao || item.product?.description || item.sku || '-',
      dimensions(item),
      numberValue(item.peso),
      quantity,
      numberValue(item.cubagem),
      numberValue(item.peso) * quantity
    ];
    styleRow(sheet, row, 1, 6, { fill: row % 2 ? COLORS.white : COLORS.lightBlue });
    styleCell(sheet.getCell(row, 3), { fill: row % 2 ? COLORS.white : COLORS.lightBlue, horizontal: 'right', numFmt: '0.000 "kg"' });
    styleCell(sheet.getCell(row, 4), { fill: row % 2 ? COLORS.white : COLORS.lightBlue, horizontal: 'center' });
    styleCell(sheet.getCell(row, 5), { fill: row % 2 ? COLORS.white : COLORS.lightBlue, horizontal: 'right', numFmt: '0.0000 "m³"' });
    styleCell(sheet.getCell(row, 6), { fill: row % 2 ? COLORS.white : COLORS.lightBlue, horizontal: 'right', numFmt: '0.000 "kg"' });
  }

  row += 2;
  setMergedValue(sheet, `A${row}:F${row}`, 'Observações', { bold: true, fill: COLORS.paleBlue, color: COLORS.navy, border: true });
  row += 1;
  setMergedValue(
    sheet,
    `A${row}:F${row + 1}`,
    'Esta proposta apresenta os resultados retornados pelas transportadoras no momento da cotação. Valores e prazos podem sofrer alterações conforme conferência dos dados e regras contratuais.',
    { color: COLORS.muted, vertical: 'top', border: true }
  );
  sheet.getRow(row).height = 24;
  sheet.getRow(row + 1).height = 24;

  sheet.autoFilter = { from: `A12`, to: `F${Math.max(12, row - 4)}` };
  sheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0, footer: 0 }
  };
  sheet.pageSetup.printArea = `A1:F${row + 1}`;
  sheet.freezePanes = { ySplit: 4 };

  return workbook;
}

module.exports = { buildQuoteWorkbook };
