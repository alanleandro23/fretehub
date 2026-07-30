const axios = require('axios');
const { mockResult } = require('./base');

const DEFAULT_QUOTE_URL = 'https://ssw.inf.br/ws/sswCotacaoCliente/index.php';
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

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/gi, '&');
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
  const message = tagValue(quoteXml, 'mensagem') || '';
  const totalFrete = parseDecimal(tagValue(quoteXml, 'totalFrete'));
  const prazo = Number(tagValue(quoteXml, 'prazo'));

  const rawResponse = {
    erro: Number.isFinite(errorCode) ? errorCode : null,
    mensagem: message || null,
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

  const success = [0, 1].includes(errorCode) && totalFrete !== null;

  return {
    carrierName: 'Camilo',
    status: success ? 'success' : 'error',
    freightValue: success ? totalFrete : null,
    deadline: success && Number.isFinite(prazo)
      ? `${prazo} dias corridos`
      : null,
    modality: success ? 'Rodoviário' : null,
    message: success
      ? (message || 'Cotação calculada pela Camilo/SSW.')
      : (message || 'A Camilo/SSW não conseguiu calcular a cotação.'),
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

module.exports = {
  quoteFreight,
  buildRequestData,
  buildSoapEnvelope,
  extractQuotationXml,
  parseQuoteXml
};
