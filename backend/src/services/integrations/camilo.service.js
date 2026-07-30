const axios = require('axios');
const { mockResult } = require('./base');
const { getConfigValue } = require('../config.service');

const DEFAULT_QUOTE_URL = 'https://ssw.inf.br/ws/sswCotacaoCliente/index.php';
const DEFAULT_TRACKING_URL = 'https://ssw.inf.br/2/ssw_resultSSW';
const SOAP_NAMESPACE = 'urn:sswCotacaoCliente';
const SOAP_ACTION = 'urn:sswCotacaoCliente#cotar';

function onlyNumbers(value) {
  return String(value || '').replace(/\D/g, '');
}

function positiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const HTML_ENTITY_MAP = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  Aacute: 'Á', aacute: 'á', Acirc: 'Â', acirc: 'â', Agrave: 'À', agrave: 'à',
  Atilde: 'Ã', atilde: 'ã', Auml: 'Ä', auml: 'ä', Aring: 'Å', aring: 'å',
  Eacute: 'É', eacute: 'é', Ecirc: 'Ê', ecirc: 'ê', Egrave: 'È', egrave: 'è',
  Euml: 'Ë', euml: 'ë', Iacute: 'Í', iacute: 'í', Icirc: 'Î', icirc: 'î',
  Igrave: 'Ì', igrave: 'ì', Iuml: 'Ï', iuml: 'ï', Oacute: 'Ó', oacute: 'ó',
  Ocirc: 'Ô', ocirc: 'ô', Ograve: 'Ò', ograve: 'ò', Otilde: 'Õ', otilde: 'õ',
  Ouml: 'Ö', ouml: 'ö', Uacute: 'Ú', uacute: 'ú', Ucirc: 'Û', ucirc: 'û',
  Ugrave: 'Ù', ugrave: 'ù', Uuml: 'Ü', uuml: 'ü', Ccedil: 'Ç', ccedil: 'ç',
  Ntilde: 'Ñ', ntilde: 'ñ'
};

function decodeXmlEntities(value) {
  let decoded = String(value || '');

  // O SSW pode devolver entidades HTML duplamente escapadas dentro do XML SOAP.
  // Fazemos mais de uma passagem para transformar, por exemplo,
  // &amp;Atilde; em Ã e &amp;nbsp; em espaço.
  for (let pass = 0; pass < 4; pass += 1) {
    const previous = decoded;
    decoded = decoded
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&([a-z][a-z0-9]+);/gi, (entity, name) => (
        Object.prototype.hasOwnProperty.call(HTML_ENTITY_MAP, name)
          ? HTML_ENTITY_MAP[name]
          : entity
      ));

    if (decoded === previous) break;
  }

  return decoded;
}

function cleanSswMessage(value) {
  return decodeXmlEntities(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function normalizeMessageForRules(value) {
  return cleanSswMessage(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function isRouteUnavailableMessage(value) {
  const normalized = normalizeMessageForRules(value);
  return [
    'NAO E ATENDIDA',
    'NAO E ATENDIDO',
    'NAO ATENDE A ROTA',
    'ROTA NAO ATENDIDA',
    'ROTA NAO ATENDIDO',
    'DESTINO NAO ATENDIDO',
    'DESTINO NAO ATENDIDA',
    'FORA DA AREA DE ATENDIMENTO',
    'SEM ATENDIMENTO PARA A ROTA'
  ].some((term) => normalized.includes(term));
}

function stripCdata(value) {
  return String(value || '')
    .replace(/^\s*<!\[CDATA\[/, '')
    .replace(/\]\]>\s*$/, '');
}

function tagValue(xml, tagName) {
  const safeName = String(tagName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<(?:[A-Za-z0-9_-]+:)?${safeName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${safeName}>`,
    'i'
  );
  const match = String(xml || '').match(regex);
  return match ? decodeXmlEntities(stripCdata(match[1]).trim()) : null;
}

function parseDecimal(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeUrl(value) {
  return String(value || DEFAULT_QUOTE_URL).trim().replace(/\?wsdl$/i, '');
}

function sumVolume(items = []) {
  return items.reduce((total, item) => {
    const quantity = Math.max(1, Number(item.quantidade || 1));
    const cubage = positiveNumber(item.cubagem) || (
      positiveNumber(item.comprimento) *
      positiveNumber(item.largura) *
      positiveNumber(item.altura) *
      quantity
    );
    return total + cubage;
  }, 0);
}

function buildRequestData(payload) {
  const credential = payload.credential || {};

  const dominio = String(
    credential.codigoCliente ||
    process.env.CAMILO_DOMAIN ||
    ''
  ).trim().toUpperCase();

  const login = String(
    credential.usuario ||
    process.env.CAMILO_USERNAME ||
    ''
  ).trim();

  const senha = String(
    credential.senha ||
    process.env.CAMILO_PASSWORD ||
    ''
  );

  // O campo "token" da credencial é usado para guardar a senha do pagador,
  // criptografada no banco pelo FreteHub.
  const senhaPagador = String(
    credential.token ||
    process.env.CAMILO_PAYER_PASSWORD ||
    ''
  );

  const cnpjPagador = onlyNumbers(
    payload.documentoPagador ||
    credential.cnpjVinculado ||
    payload.company?.cnpj
  );

  const cepOrigem = onlyNumbers(payload.cepOrigem);
  const cepDestino = onlyNumbers(payload.cepDestino);
  const cnpjDestinatario = onlyNumbers(payload.cnpjDestinatario || payload.documentoDestinatario);
  const cnpjRemetente = onlyNumbers(payload.documentoRemetente || payload.company?.cnpj);

  if (dominio.length !== 3) {
    throw new Error('Credencial Camilo incompleta: informe o domínio SSW com 3 caracteres.');
  }
  if (!login || !senha) {
    throw new Error('Credencial Camilo incompleta: informe usuário e senha do SSW.');
  }
  if (!senhaPagador) {
    throw new Error('Credencial Camilo incompleta: informe a senha do pagador no campo Senha do pagador.');
  }
  if (cnpjPagador.length !== 14) {
    throw new Error('A cotação Camilo exige o CNPJ do pagador com 14 dígitos.');
  }
  if (cepOrigem.length !== 8 || cepDestino.length !== 8) {
    throw new Error('A cotação Camilo exige CEP de origem e destino com 8 dígitos.');
  }

  return {
    dominio,
    login,
    senha,
    cnpjPagador,
    senhaPagador,
    cepOrigem: Number(cepOrigem),
    cepDestino: Number(cepDestino),
    valorNF: positiveNumber(payload.valorMercadoria),
    quantidade: Math.max(1, Math.trunc(positiveNumber(payload.quantidadeVolumes, 1))),
    peso: positiveNumber(payload.pesoTotal),
    volume: Number(sumVolume(payload.items).toFixed(4)),
    mercadoria: Math.max(
      1,
      Math.trunc(
        positiveNumber(
          credential.contrato || process.env.CAMILO_MERCHANDISE_CODE,
          1
        )
      )
    ),
    cnpjDestinatario: cnpjDestinatario.length === 14 ? cnpjDestinatario : null,
    coletar: String(payload.coletar || 'N').toUpperCase() === 'S' ? 'S' : 'N',
    entDificil: String(payload.entDificil || 'N').toUpperCase() === 'S' ? 'S' : 'N',
    destContribuinte: String(payload.destContribuinte || 'N').toUpperCase() === 'S' ? 'S' : 'N',
    cnpjRemetente: cnpjRemetente.length === 14 ? cnpjRemetente : null
  };
}

function soapParam(name, value, type = 'xsd:string') {
  if (value === null || value === undefined || value === '') return '';
  return `<${name} xsi:type="${type}">${xmlEscape(value)}</${name}>`;
}

function buildSoapEnvelope(data) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="${SOAP_NAMESPACE}">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:cotar soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      ${soapParam('dominio', data.dominio)}
      ${soapParam('login', data.login)}
      ${soapParam('senha', data.senha)}
      ${soapParam('cnpjPagador', data.cnpjPagador)}
      ${soapParam('senhaPagador', data.senhaPagador)}
      ${soapParam('cepOrigem', data.cepOrigem, 'xsd:int')}
      ${soapParam('cepDestino', data.cepDestino, 'xsd:int')}
      ${soapParam('valorNF', data.valorNF, 'xsd:decimal')}
      ${soapParam('quantidade', data.quantidade, 'xsd:int')}
      ${soapParam('peso', data.peso, 'xsd:decimal')}
      ${soapParam('volume', data.volume, 'xsd:decimal')}
      ${soapParam('mercadoria', data.mercadoria, 'xsd:int')}
      ${soapParam('cnpjDestinatario', data.cnpjDestinatario)}
      ${soapParam('coletar', data.coletar)}
      ${soapParam('entDificil', data.entDificil)}
      ${soapParam('destContribuinte', data.destContribuinte)}
      ${soapParam('cnpjRemetente', data.cnpjRemetente)}
    </urn:cotar>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function extractQuotationXml(soapResponse) {
  const responseText = String(soapResponse || '');

  const fault = tagValue(responseText, 'faultstring');
  if (fault) {
    throw new Error(`SSW retornou uma falha SOAP: ${fault}`);
  }

  const returned =
    tagValue(responseText, 'return') ||
    tagValue(responseText, 'cotarReturn') ||
    tagValue(responseText, 'resultado');

  const candidate = decodeXmlEntities(returned || responseText);
  const quotationMatch = candidate.match(/<cotacao(?:\s[^>]*)?>[\s\S]*?<\/cotacao>/i);

  if (!quotationMatch) {
    throw new Error('A resposta da Camilo/SSW não contém o XML de cotação esperado.');
  }

  return quotationMatch[0];
}

function parseQuoteXml(quoteXml) {
  const errorCode = Number(tagValue(quoteXml, 'erro'));
  const message = cleanSswMessage(tagValue(quoteXml, 'mensagem') || '');
  const totalFrete = parseDecimal(tagValue(quoteXml, 'totalFrete'));
  const prazo = Number(tagValue(quoteXml, 'prazo'));
  const routeUnavailable = isRouteUnavailableMessage(message);
  const calculated = [0, 1].includes(errorCode) && totalFrete !== null;
  const success = calculated && !routeUnavailable;

  const rawResponse = {
    erro: Number.isFinite(errorCode) ? errorCode : null,
    mensagem: message || null,
    routeUnavailable,
    calculatedByProvider: calculated,
    pesoCalculo: parseDecimal(tagValue(quoteXml, 'pesoCalculo')),
    prazo: Number.isFinite(prazo) ? prazo : null,
    totalFrete,
    fretePeso: parseDecimal(tagValue(quoteXml, 'fretePeso')),
    freteValor: parseDecimal(tagValue(quoteXml, 'freteValor')),
    despacho: parseDecimal(tagValue(quoteXml, 'despacho')),
    cat: parseDecimal(tagValue(quoteXml, 'cat')),
    itr: parseDecimal(tagValue(quoteXml, 'itr')),
    gris: parseDecimal(tagValue(quoteXml, 'gris')),
    pedagio: parseDecimal(tagValue(quoteXml, 'pedagio')),
    coleta: parseDecimal(tagValue(quoteXml, 'coleta')),
    entrega: parseDecimal(tagValue(quoteXml, 'entrega')),
    impostos: parseDecimal(tagValue(quoteXml, 'impostos')),
    tabCalculo: tagValue(quoteXml, 'tabCalculo') || null,
    tar: parseDecimal(tagValue(quoteXml, 'tar')),
    trt: parseDecimal(tagValue(quoteXml, 'trt')),
    tdc: parseDecimal(tagValue(quoteXml, 'tdc')),
    entGeral: parseDecimal(tagValue(quoteXml, 'entGeral')),
    outros: parseDecimal(tagValue(quoteXml, 'outros'))
  };

  let finalMessage;
  if (routeUnavailable) {
    finalMessage = message || 'A Camilo não atende a rota informada.';
  } else if (success && errorCode === 1) {
    finalMessage = message
      ? `Cotação calculada com alerta: ${message}`
      : 'Cotação calculada com alerta pela Camilo/SSW.';
  } else if (success) {
    finalMessage = message || 'Cotação calculada pela Camilo/SSW.';
  } else {
    finalMessage = message || 'A Camilo/SSW não conseguiu calcular a cotação.';
  }

  return {
    carrierName: 'Camilo',
    status: success ? 'success' : 'error',
    freightValue: success ? totalFrete : null,
    deadline: success && Number.isFinite(prazo)
      ? `${prazo} dias corridos`
      : null,
    modality: success ? 'Rodoviário' : null,
    message: finalMessage,
    rawResponse
  };
}

async function quoteFreight(payload) {
  const credential = payload.credential || {};
  const hasRegisteredCredential = Boolean(
    credential.codigoCliente &&
    credential.usuario &&
    credential.senha &&
    credential.token
  );

  const useRealApi =
    process.env.CAMILO_API_ENABLED === 'true' ||
    hasRegisteredCredential;

  if (!useRealApi) {
    return mockResult('Camilo', payload, 90, 9);
  }

  const requestData = buildRequestData(payload);
  const quoteUrl = normalizeUrl(
    payload.carrier?.apiUrl ||
    process.env.CAMILO_QUOTE_URL ||
    DEFAULT_QUOTE_URL
  );
  const envelope = buildSoapEnvelope(requestData);

  console.log('Camilo/SSW — cotação iniciada:', {
    endpoint: quoteUrl,
    dominio: requestData.dominio,
    cnpjPagador: requestData.cnpjPagador,
    cepOrigem: requestData.cepOrigem,
    cepDestino: requestData.cepDestino,
    quantidade: requestData.quantidade,
    peso: requestData.peso,
    volume: requestData.volume,
    valorNF: requestData.valorNF
  });

  try {
    const response = await axios.post(quoteUrl, envelope, {
      timeout: 30000,
      responseType: 'text',
      transformResponse: [(data) => data],
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        Accept: 'text/xml, application/xml',
        SOAPAction: `"${SOAP_ACTION}"`
      }
    });

    const quoteXml = extractQuotationXml(response.data);
    const result = parseQuoteXml(quoteXml);

    console.log('Camilo/SSW — resposta interpretada:', {
      httpStatus: response.status,
      status: result.status,
      valorFrete: result.freightValue,
      prazo: result.deadline,
      mensagem: result.message
    });

    return result;
  } catch (error) {
    const responseText = typeof error.response?.data === 'string'
      ? error.response.data
      : '';
    const soapFault = tagValue(responseText, 'faultstring');
    const message = soapFault || error.message || 'Erro na cotação Camilo/SSW.';

    console.error('Erro Camilo/SSW:', {
      status: error.response?.status || null,
      mensagem: message
    });

    return {
      carrierName: 'Camilo',
      status: 'error',
      freightValue: null,
      deadline: null,
      modality: null,
      message,
      rawResponse: {
        httpStatus: error.response?.status || null,
        soapFault: soapFault || null
      }
    };
  }
}


function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&otilde;/gi, 'õ')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&Atilde;/g, 'Ã')
    .replace(/&Otilde;/g, 'Õ')
    .replace(/&Ccedil;/g, 'Ç')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/gi, '&');
}

function normalizeWhitespace(value) {
  return decodeHtmlEntities(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToText(value) {
  return normalizeWhitespace(
    String(value || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
}

function htmlToLines(value) {
  const expanded = String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/td|\/th)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(expanded)
    .split(/\r?\n/)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function parseDateText(value) {
  const text = normalizeWhitespace(value);
  const match = text.match(/(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
  if (!match) return null;
  return `${match[1]} ${match[2] || '12:00:00'}`;
}

function extractLocation(value) {
  const text = normalizeWhitespace(value);
  if (!text) return { cidade: null, uf: null };

  const labelRemoved = text.replace(/^(?:ORIGEM|DESTINO|LOCAL|UNIDADE)\s*:?\s*/i, '');
  const match = labelRemoved.match(/([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{1,80}?)\s*(?:\/|\s+-\s+)\s*([A-Z]{2})(?:\b|$)/i);
  if (!match) return { cidade: null, uf: null };

  return {
    cidade: normalizeWhitespace(match[1]).toUpperCase(),
    uf: match[2].toUpperCase()
  };
}

function rowCells(rowHtml) {
  return [...String(rowHtml || '').matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
    .map((match) => htmlToText(match[1]))
    .filter(Boolean);
}

function meaningfulOccurrence(cells, dateIndex) {
  const ignored = [
    'DATA', 'HORA', 'STATUS', 'OCORRENCIA', 'OCORRÊNCIA', 'LOCAL', 'UNIDADE',
    'NOTA FISCAL', 'NF', 'PEDIDO', 'CONHECIMENTO', 'CTE', 'CT-E', 'PREVISAO', 'PREVISÃO'
  ];

  const candidates = cells.filter((cell, index) => {
    if (index === dateIndex) return false;
    const normalized = normalizeSearchText(cell);
    if (!normalized || ignored.includes(normalized)) return false;
    if (/^\d{1,18}$/.test(normalized)) return false;
    if (/^\d{2}\/\d{2}\/\d{4}/.test(normalized)) return false;
    if (extractLocation(cell).cidade) return false;
    return normalized.length >= 3;
  });

  return candidates.sort((a, b) => b.length - a.length)[0] || null;
}

function parseTrackingRows(html) {
  const rows = [...String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const events = [];

  rows.forEach((rowMatch, rowIndex) => {
    const cells = rowCells(rowMatch[1]);
    if (!cells.length) return;

    const dateIndex = cells.findIndex((cell) => parseDateText(cell));
    if (dateIndex < 0) return;

    const date = parseDateText(cells[dateIndex]);
    const occurrence = meaningfulOccurrence(cells, dateIndex);
    if (!occurrence) return;

    const locations = cells.map(extractLocation).filter((item) => item.cidade && item.uf);
    const origin = locations[0] || { cidade: null, uf: null };
    const destination = locations[1] || locations[0] || { cidade: null, uf: null };

    events.push({
      tipo: occurrence,
      descricao: occurrence,
      dataEvento: date,
      cidade: origin.cidade || destination.cidade,
      uf: origin.uf || destination.uf,
      cidadeOrigem: origin.cidade,
      ufOrigem: origin.uf,
      cidadeDestino: destination.cidade,
      ufDestino: destination.uf,
      sourceKey: `SSW:ROW:${rowIndex}:${date}:${normalizeSearchText(occurrence)}`,
      rawResponse: { cells }
    });
  });

  return events;
}

function parseTrackingLines(html) {
  const lines = htmlToLines(html);
  const events = [];

  for (let index = 0; index < lines.length; index += 1) {
    const date = parseDateText(lines[index]);
    if (!date) continue;

    const context = lines.slice(Math.max(0, index - 2), index + 5);
    const occurrence = context.find((line) => {
      const normalized = normalizeSearchText(line);
      return !parseDateText(line) &&
        normalized.length >= 4 &&
        !['DATA', 'HORA', 'STATUS', 'OCORRENCIA', 'OCORRÊNCIA', 'LOCAL', 'UNIDADE'].includes(normalized) &&
        !extractLocation(line).cidade &&
        !/^\d+$/.test(normalized);
    });

    if (!occurrence) continue;

    const locations = context.map(extractLocation).filter((item) => item.cidade && item.uf);
    events.push({
      tipo: occurrence,
      descricao: occurrence,
      dataEvento: date,
      cidade: locations[0]?.cidade || null,
      uf: locations[0]?.uf || null,
      cidadeOrigem: locations[0]?.cidade || null,
      ufOrigem: locations[0]?.uf || null,
      cidadeDestino: locations[1]?.cidade || locations[0]?.cidade || null,
      ufDestino: locations[1]?.uf || locations[0]?.uf || null,
      sourceKey: `SSW:LINE:${index}:${date}:${normalizeSearchText(occurrence)}`,
      rawResponse: { context }
    });
  }

  return events;
}

function deduplicateEvents(events = []) {
  const map = new Map();
  events.forEach((event) => {
    const key = [
      parseDateText(event.dataEvento) || event.dataEvento,
      normalizeSearchText(event.descricao || event.tipo),
      normalizeSearchText(event.cidadeOrigem),
      normalizeSearchText(event.ufOrigem),
      normalizeSearchText(event.cidadeDestino),
      normalizeSearchText(event.ufDestino)
    ].join('|');
    if (!map.has(key)) map.set(key, event);
  });
  return [...map.values()];
}

function findDateByLabel(lines, labels) {
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeSearchText(lines[index]);
    if (!labels.some((label) => normalized.includes(label))) continue;

    const inline = parseDateText(lines[index]);
    if (inline) return inline.split(' ')[0];

    for (let offset = 1; offset <= 3; offset += 1) {
      const next = lines[index + offset];
      const parsed = parseDateText(next);
      if (parsed) return parsed.split(' ')[0];
    }
  }
  return null;
}

function findLocationByLabel(lines, label) {
  const labelNormalized = normalizeSearchText(label);
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeSearchText(lines[index]);
    if (!normalized.includes(labelNormalized)) continue;

    const inline = extractLocation(lines[index]);
    if (inline.cidade) return inline;

    for (let offset = 1; offset <= 3; offset += 1) {
      const next = extractLocation(lines[index + offset]);
      if (next.cidade) return next;
    }
  }
  return { cidade: null, uf: null };
}

function findIdentifier(lines, labels) {
  const normalizedLabels = labels.map(normalizeSearchText);
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeSearchText(lines[index]);
    if (!normalizedLabels.some((label) => normalized.includes(label))) continue;

    const inline = lines[index].match(/(?:\b|:)(\d{3,20})(?:\b|$)/);
    if (inline) return inline[1];

    for (let offset = 1; offset <= 2; offset += 1) {
      const next = String(lines[index + offset] || '').match(/^\d{3,20}$/);
      if (next) return next[0];
    }
  }
  return null;
}

function isDeliveredText(value) {
  const normalized = normalizeSearchText(value);
  return normalized.includes('ENTREGUE') ||
    normalized.includes('ENTREGA REALIZADA') ||
    normalized.includes('MERCADORIA ENTREGUE');
}

function parseTrackingHtml(html, requested = {}) {
  const text = htmlToText(html);
  const normalizedPage = normalizeSearchText(text);

  const errorMessages = [
    'NENHUM REGISTRO ENCONTRADO',
    'NOTA FISCAL NAO ENCONTRADA',
    'NOTA FISCAL NÃO ENCONTRADA',
    'CNPJ INVALIDO',
    'CNPJ INVÁLIDO',
    'SENHA INVALIDA',
    'SENHA INVÁLIDA'
  ];
  const detectedError = errorMessages.find((message) => normalizedPage.includes(normalizeSearchText(message)));
  if (detectedError) {
    throw new Error(`Camilo/SSW: ${detectedError.toLowerCase()}.`);
  }

  const lines = htmlToLines(html);
  const rowEvents = parseTrackingRows(html);
  const lineEvents = rowEvents.length ? [] : parseTrackingLines(html);
  const events = deduplicateEvents([...rowEvents, ...lineEvents]).sort((a, b) => {
    const parse = (value) => {
      const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
      if (!match) return 0;
      return new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6] || '00'}`).getTime();
    };
    return parse(a.dataEvento) - parse(b.dataEvento);
  });

  const origin = findLocationByLabel(lines, 'origem');
  const destination = findLocationByLabel(lines, 'destino');
  const enrichedEvents = events.map((event) => ({
    ...event,
    cidadeOrigem: event.cidadeOrigem || event.cidade || origin.cidade || null,
    ufOrigem: event.ufOrigem || event.uf || origin.uf || null,
    cidadeDestino: destination.cidade || event.cidadeDestino || null,
    ufDestino: destination.uf || event.ufDestino || null
  }));
  const latest = enrichedEvents[enrichedEvents.length - 1] || null;
  const latestDestination = {
    cidade: destination.cidade || latest?.cidadeDestino || latest?.cidade || null,
    uf: destination.uf || latest?.ufDestino || latest?.uf || null
  };
  const latestOrigin = {
    cidade: origin.cidade || latest?.cidadeOrigem || null,
    uf: origin.uf || latest?.ufOrigem || null
  };

  const deliveredEvent = [...enrichedEvents].reverse().find((event) => isDeliveredText(event.descricao || event.tipo));
  const delivered = Boolean(deliveredEvent);
  const summaryOccurrence = latest?.descricao || latest?.tipo || (
    delivered ? 'ENTREGA REALIZADA' : 'Carga localizada no SSW'
  );

  if (!events.length && !normalizedPage.includes('RASTREAMENTO')) {
    throw new Error('Camilo/SSW retornou uma página sem dados de rastreamento reconhecíveis.');
  }

  return {
    status: delivered ? 'Entregue' : 'Em trânsito',
    ultimaOcorrencia: summaryOccurrence,
    dataEvento: latest?.dataEvento || null,
    previsaoEntrega: findDateByLabel(lines, ['PREVISAO DE ENTREGA', 'PREVISÃO DE ENTREGA']),
    dataEntrega: deliveredEvent?.dataEvento || findDateByLabel(lines, ['DATA DE ENTREGA', 'ENTREGA REALIZADA']),
    cidade: latestDestination.cidade,
    uf: latestDestination.uf,
    cidadeOrigem: latestOrigin.cidade,
    ufOrigem: latestOrigin.uf,
    notaFiscal: requested.notaFiscal || findIdentifier(lines, ['NOTA FISCAL', 'NF']),
    pedido: requested.pedido || findIdentifier(lines, ['PEDIDO']),
    conhecimento: requested.conhecimento || findIdentifier(lines, ['CONHECIMENTO', 'CTE', 'CT-E', 'CTRC']),
    eventos: enrichedEvents,
    rawResponse: {
      provider: 'SSW',
      htmlLength: String(html || '').length,
      pageTitle: (String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]
        ? htmlToText((String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1])
        : null,
      eventsFound: enrichedEvents.length
    }
  };
}

async function trackShipment(payload = {}) {
  const credential = payload.credential || {};
  const cnpj = onlyNumbers(
    payload.documento ||
    credential.cnpjVinculado
  );
  const reference = String(
    payload.notaFiscal ||
    payload.pedido ||
    payload.conhecimento ||
    ''
  ).trim();
  const payerPassword = String(
    credential.token ||
    process.env.CAMILO_PAYER_PASSWORD ||
    ''
  );

  if (cnpj.length !== 14) {
    throw new Error('Para a Camilo, informe o CNPJ do remetente ou pagador com 14 dígitos.');
  }
  if (!reference) {
    throw new Error('Para a Camilo, informe a Nota Fiscal ou o número do Pedido.');
  }
  if (!payerPassword) {
    throw new Error('Credencial Camilo incompleta: informe a Senha do pagador.');
  }

  const endpoint = String(
    await getConfigValue('CAMILO_TRACKING_URL', DEFAULT_TRACKING_URL)
  ).trim() || DEFAULT_TRACKING_URL;

  const form = new URLSearchParams();
  form.set('NR', reference);
  form.set('cnpj', cnpj);
  form.set('chave', payerPassword);
  form.set('urlori', '');

  console.log('Tracking Camilo/SSW — consulta iniciada:', {
    endpoint,
    cnpj,
    referencia: reference,
    tipoConsulta: payload.notaFiscal ? 'notaFiscal' : payload.pedido ? 'pedido' : 'conhecimento'
  });

  try {
    const response = await axios.post(endpoint, form.toString(), {
      timeout: 30000,
      responseType: 'text',
      transformResponse: [(data) => data],
      maxRedirects: 5,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://ssw.inf.br/2/rastreamento',
        'User-Agent': 'FreteHub/1.0'
      }
    });

    const result = parseTrackingHtml(response.data, {
      notaFiscal: payload.notaFiscal,
      pedido: payload.pedido,
      conhecimento: payload.conhecimento
    });

    console.log('Tracking Camilo/SSW — resposta interpretada:', {
      httpStatus: response.status,
      eventosEncontrados: result.eventos.length,
      ultimaOcorrencia: result.ultimaOcorrencia,
      previsaoEntrega: result.previsaoEntrega,
      destino: result.cidade && result.uf ? `${result.cidade}/${result.uf}` : result.cidade || result.uf || null
    });

    return result;
  } catch (error) {
    const status = error.response?.status || null;
    const message = error.message || 'Erro no tracking Camilo/SSW.';
    console.error('Erro Tracking Camilo/SSW:', { status, mensagem: message });
    throw new Error(status ? `Camilo/SSW respondeu HTTP ${status}: ${message}` : message);
  }
}

module.exports = {
  quoteFreight,
  trackShipment,
  buildRequestData,
  buildSoapEnvelope,
  extractQuotationXml,
  parseQuoteXml,
  cleanSswMessage,
  isRouteUnavailableMessage,
  parseTrackingHtml,
  parseTrackingRows
};
