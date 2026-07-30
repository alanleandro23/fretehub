const ExcelJS = require('exceljs');

function formatDocument(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 14) {
    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5'
    );
  }

  if (digits.length === 11) {
    return digits.replace(
      /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
      '$1.$2.$3-$4'
    );
  }

  return value || '-';
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDimensionMetersToCentimeters(value) {
  const centimeters = numberValue(value) * 100;
  return Number.isInteger(centimeters)
    ? String(centimeters)
    : centimeters.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function volumeLabel(value) {
  const quantity = Math.max(0, Math.trunc(numberValue(value)));
  const padded = String(quantity).padStart(2, '0');
  return `${padded} ${quantity === 1 ? 'volume' : 'volumes'}`;
}

function successfulResults(quote) {
  return (quote.results || []).filter(
    (result) => result.status === 'success' && result.valorFrete != null
  );
}

function border(style = 'thin') {
  return {
    top: { style, color: { argb: 'FF222222' } },
    left: { style, color: { argb: 'FF222222' } },
    bottom: { style, color: { argb: 'FF222222' } },
    right: { style, color: { argb: 'FF222222' } }
  };
}

function styleTableCell(cell, options = {}) {
  cell.font = {
    name: 'Arial',
    size: options.size || 10,
    bold: Boolean(options.bold),
    color: { argb: options.fontColor || 'FF1F2937' }
  };
  cell.alignment = {
    vertical: 'middle',
    horizontal: options.horizontal || 'left',
    wrapText: true
  };
  cell.border = border(options.borderStyle || 'thin');

  if (options.fill) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: options.fill }
    };
  }
}

function addProductBlock(worksheet, startRow, item, index) {
  const description =
    item.descricao ||
    item.product?.description ||
    item.sku ||
    item.product?.sku ||
    `Produto ${index + 1}`;

  const quantity = Math.max(1, Math.trunc(numberValue(item.quantidade, 1)));
  const totalWeight = numberValue(item.peso) * quantity;

  // A ordem largura x altura x comprimento reproduz o modelo visual enviado.
  const dimensions = [
    formatDimensionMetersToCentimeters(item.largura),
    formatDimensionMetersToCentimeters(item.altura),
    formatDimensionMetersToCentimeters(item.comprimento)
  ].join(' x ');

  const lines = [
    String(description),
    volumeLabel(quantity),
    `Dimensões: ${dimensions}`,
    `Peso: ${totalWeight.toLocaleString('pt-BR', {
      minimumFractionDigits: Number.isInteger(totalWeight) ? 0 : 2,
      maximumFractionDigits: 2
    })} kg`
  ];

  lines.forEach((text, offset) => {
    const rowNumber = startRow + offset;
    worksheet.mergeCells(`A${rowNumber}:C${rowNumber}`);
    const cell = worksheet.getCell(`A${rowNumber}`);
    cell.value = text;
    cell.font = {
      name: 'Arial',
      size: 10,
      bold: offset === 0,
      color: { argb: 'FF1F2937' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getRow(rowNumber).height = 18;
  });

  return startRow + lines.length;
}

async function buildQuoteWorkbook(quote) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FreteHub';
  workbook.company = quote.company?.razaoSocial || 'FreteHub';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Cotação', {
    views: [{ showGridLines: false }]
  });

  worksheet.columns = [
    { key: 'carrier', width: 42 },
    { key: 'value', width: 18 },
    { key: 'deadline', width: 18 }
  ];

  const destinationName = String(
    quote.razaoSocialDestinatario || 'DESTINATÁRIO NÃO INFORMADO'
  ).toUpperCase();
  const destinationUf = String(quote.ufDestino || '').toUpperCase();
  const titleParts = [formatDocument(quote.cnpjDestinatario), destinationName];
  if (destinationUf) titleParts.push(destinationUf);

  worksheet.mergeCells('A1:C1');
  const title = worksheet.getCell('A1');
  title.value = titleParts.join(' - ');
  title.font = {
    name: 'Arial',
    size: 10,
    bold: true,
    color: { argb: 'FFFF0000' }
  };
  title.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  title.border = border('medium');
  worksheet.getRow(1).height = 23;

  const modal = quote.modal || 'Rodoviário';
  const headerValues = ['-', modal, 'Prazo'];
  worksheet.getRow(2).values = headerValues;
  worksheet.getRow(2).height = 21;

  styleTableCell(worksheet.getCell('A2'), {
    bold: true,
    horizontal: 'center',
    fill: 'FF92D050',
    borderStyle: 'medium'
  });
  styleTableCell(worksheet.getCell('B2'), {
    bold: true,
    horizontal: 'center',
    fill: 'FFD9E4EC',
    borderStyle: 'medium'
  });
  styleTableCell(worksheet.getCell('C2'), {
    bold: true,
    horizontal: 'center',
    fill: 'FFD9E4EC',
    borderStyle: 'medium'
  });

  const results = successfulResults(quote);
  const exportResults = results.length ? results : (quote.results || []);
  let currentRow = 3;

  for (const result of exportResults) {
    const row = worksheet.getRow(currentRow);
    row.values = [
      result.carrier?.nome || '-',
      result.valorFrete == null ? '-' : numberValue(result.valorFrete),
      result.prazo || result.mensagem || '-'
    ];
    row.height = 20;

    styleTableCell(row.getCell(1));
    styleTableCell(row.getCell(2), { horizontal: 'right' });
    styleTableCell(row.getCell(3), { horizontal: 'center' });

    if (result.valorFrete != null) {
      row.getCell(2).numFmt = 'R$ #,##0.00';
    }

    currentRow += 1;
  }

  if (!exportResults.length) {
    worksheet.getRow(currentRow).values = ['Nenhum resultado disponível', '-', '-'];
    for (let column = 1; column <= 3; column += 1) {
      styleTableCell(worksheet.getRow(currentRow).getCell(column));
    }
    currentRow += 1;
  }

  currentRow += 3;

  const items = quote.items || [];
  if (items.length) {
    items.forEach((item, index) => {
      currentRow = addProductBlock(worksheet, currentRow, item, index);
      if (index < items.length - 1) currentRow += 1;
    });
  } else {
    worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = volumeLabel(quote.quantidadeVolumes);
    currentRow += 1;

    worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `Peso: ${numberValue(
      quote.pesoTotal
    ).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`;
    currentRow += 1;
  }

  currentRow += 2;
  worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
  const totalCell = worksheet.getCell(`A${currentRow}`);
  totalCell.value = {
    richText: [
      {
        text: 'Valor total: ',
        font: { name: 'Arial', size: 10 }
      },
      {
        text: numberValue(quote.valorMercadoria).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }),
        font: { name: 'Arial', size: 10, bold: true }
      }
    ]
  };
  totalCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(currentRow).height = 20;

  worksheet.pageSetup = {
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0,
      footer: 0
    }
  };
  worksheet.pageSetup.printArea = `A1:C${currentRow}`;

  return workbook;
}

module.exports = { buildQuoteWorkbook };
