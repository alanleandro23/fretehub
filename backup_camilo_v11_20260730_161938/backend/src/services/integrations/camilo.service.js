const soap = require('soap');
const { mockResult } = require('./base');

function onlyNumbers(value) {
  return String(value || '').replace(/\D/g, '');
}

function positiveNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) && number >= 0
    ? number
    : fallback;
}

function calculateVolume(items = []) {
  return items.reduce((total, item) => {
    /*
     * O quote.service.js já calcula cubagem considerando
     * comprimento × largura × altura × quantidade.
     */
    const cubagem = positiveNumber(item.cubagem);

    if (cubagem > 0) {
      return total + cubagem;
    }

    const comprimento = positiveNumber(item.comprimento);
    const largura = positiveNumber(item.largura);
    const altura = positiveNumber(item.altura);
    const quantidade = Math.max(
      1,
      Math.trunc(positiveNumber(item.quantidade, 1))
    );

    return (
      total +
      comprimento *
        largura *
        altura *
        quantidade
    );
  }, 0);
}

function decodeEntity(entity) {
  const entities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    Atilde: 'Ã',
    atilde: 'ã',
    Aacute: 'Á',
    aacute: 'á',
    Eacute: 'É',
    eacute: 'é',
    Iacute: 'Í',
    iacute: 'í',
    Oacute: 'Ó',
    oacute: 'ó',
    Uacute: 'Ú',
    uacute: 'ú',
    Ccedil: 'Ç',
    ccedil: 'ç'
  };

  if (entity.startsWith('#x')) {
    return String.fromCodePoint(
      Number.parseInt(entity.slice(2), 16)
    );
  }

  if (entity.startsWith('#')) {
    return String.fromCodePoint(
      Number.parseInt(entity.slice(1), 10)
    );
  }

  return entities[entity] ?? `&${entity};`;
}

function decodeEntities(value) {
  let result = String(value || '');

  /*
   * Duas passagens resolvem casos como:
   * &amp;Atilde; -> &Atilde; -> Ã
   */
  for (let i = 0; i < 2; i += 1) {
    result = result.replace(
      /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g,
      (_, entity) => decodeEntity(entity)
    );
  }

  return result;
}

function findQuoteXml(value, visited = new Set()) {
  if (Buffer.isBuffer(value)) {
    return findQuoteXml(
      value.toString('utf8'),
      visited
    );
  }

  if (typeof value === 'string') {
    let decoded = decodeEntities(value).trim();

    decoded = decoded
      .replace(
        /^<!\[CDATA\[([\s\S]*)\]\]>$/i,
        '$1'
      )
      .trim();

    /*
     * Aceita:
     * <cotacao>
     * <ns:cotacao>
     * <ssw:cotacao>
     */
    const match = decoded.match(
      /<(?:[\w.-]+:)?cotacao\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?cotacao>/i
    );

    return match ? match[0] : null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  if (visited.has(value)) {
    return null;
  }

  visited.add(value);

  const children = Array.isArray(value)
    ? value
    : Object.values(value);

  for (const child of children) {
    const found = findQuoteXml(
      child,
      visited
    );

    if (found) {
      return found;
    }
  }

  return null;
}

function localTagName(key) {
  return String(key || '')
    .split(':')
    .pop();
}

function objectPrimitiveValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  /*
   * Alguns parsers SOAP guardam o conteúdo
   * dentro de $value ou _.
   */
  if (
    Object.prototype.hasOwnProperty.call(
      value,
      '$value'
    )
  ) {
    return value.$value;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      '_'
    )
  ) {
    return value._;
  }

  return value;
}

function normalizeQuoteObject(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Buffer.isBuffer(value)
  ) {
    return null;
  }

  const normalized = {};

  for (
    const [key, child] of Object.entries(value)
  ) {
    normalized[localTagName(key)] =
      objectPrimitiveValue(child);
  }

  /*
   * Identifica diretamente um objeto de cotação
   * que já tenha sido interpretado pelo node-soap.
   */
  if (
    Object.prototype.hasOwnProperty.call(
      normalized,
      'erro'
    ) &&
    (
      Object.prototype.hasOwnProperty.call(
        normalized,
        'mensagem'
      ) ||
      Object.prototype.hasOwnProperty.call(
        normalized,
        'totalFrete'
      )
    )
  ) {
    return normalized;
  }

  return null;
}

function findQuoteObject(
  value,
  visited = new Set()
) {
  const direct =
    normalizeQuoteObject(value);

  if (direct) {
    return direct;
  }

  if (
    !value ||
    typeof value !== 'object' ||
    Buffer.isBuffer(value)
  ) {
    return null;
  }

  if (visited.has(value)) {
    return null;
  }

  visited.add(value);

  const children = Array.isArray(value)
    ? value
    : Object.values(value);

  for (const child of children) {
    const found = findQuoteObject(
      child,
      visited
    );

    if (found) {
      return found;
    }
  }

  return null;
}

function parseQuoteXml(xml) {
  const decoded = decodeEntities(xml);

  const cotacaoMatch = decoded.match(
    /<(?:[\w.-]+:)?cotacao\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?cotacao>/i
  );

  if (!cotacaoMatch) {
    throw new Error(
      'A resposta da SSW não contém o elemento cotacao.'
    );
  }

  const body = cotacaoMatch[1];
  const result = {};

  /*
   * Interpreta tags comuns e tags com namespace.
   */
  const tagExpression =
    /<(?:[\w.-]+:)?([a-zA-Z0-9_]+)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?\1\s*>|<(?:[\w.-]+:)?([a-zA-Z0-9_]+)\b[^>]*\/\s*>/g;

  let match;

  while (
    (match = tagExpression.exec(body)) !== null
  ) {
    const tag = match[1] || match[3];
    const value = match[2] || '';

    result[tag] = decodeEntities(
      value
        .replace(/^<!\[CDATA\[/, '')
        .replace(/\]\]>$/, '')
        .trim()
    );
  }

  return result;
}

function buildRequest(payload) {
  const credential = payload.credential || {};

  /*
   * Mapeamento da tela Credenciais:
   *
   * codigoCliente = domínio SSW
   * usuario       = login SSW
   * senha         = senha do usuário
   * token         = senha do pagador
   * cnpjVinculado = CNPJ pagador
   */

  const dominio = String(
    credential.codigoCliente ||
      process.env.CAMILO_DOMAIN ||
      ''
  ).trim();

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

  const senhaPagador = String(
    credential.token ||
      process.env.CAMILO_PAYER_PASSWORD ||
      ''
  );

  const cnpjRemetente = onlyNumbers(
  payload.documentoRemetente ||
    payload.company?.cnpj ||
    credential.cnpjVinculado ||
    process.env.CAMILO_CNPJ_REMETENTE ||
    process.env.CAMILO_CNPJ_PAGADOR
);

const cnpjPagador = cnpjRemetente;

  const documentoDestinatario = onlyNumbers(
  payload.documentoDestinatario ||
    payload.cnpjDestinatario
);

const cnpjDestinatario =
  documentoDestinatario.length === 14
    ? documentoDestinatario
    : '';

  const cepOrigem = onlyNumbers(
    payload.cepOrigem ||
      payload.company?.cep ||
      process.env.CAMILO_CEP_ORIGEM
  );

  const cepDestino = onlyNumbers(
    payload.cepDestino
  );

  const valorNF = Number(
    positiveNumber(payload.valorMercadoria).toFixed(2)
  );

  const quantidade = Math.max(
    1,
    Math.trunc(
      positiveNumber(payload.quantidadeVolumes, 1)
    )
  );

  const peso = Number(
    positiveNumber(payload.pesoTotal).toFixed(3)
  );

  const volume = Number(
    calculateVolume(payload.items).toFixed(4)
  );

  const missing = [];

  if (!dominio) missing.push('domínio');
  if (!login) missing.push('login');
  if (!senha) missing.push('senha do usuário');
  if (!cnpjRemetente) {
      missing.push('CNPJ do remetente/pagador');
    }
  if (!senhaPagador) missing.push('senha do pagador');
  if (!cepOrigem) missing.push('CEP de origem');
  if (!cepDestino) missing.push('CEP de destino');
  if (valorNF <= 0) missing.push('valor da mercadoria');
  if (peso <= 0) missing.push('peso da carga');
  if (volume <= 0) missing.push('cubagem da carga');

  if (missing.length > 0) {
    throw new Error(
      `Configuração Camilo incompleta: ${missing.join(', ')}.`
    );
  }

  const request = {
    dominio,
    login,
    senha,
    cnpjPagador,
    senhaPagador,
    cepOrigem: Number(cepOrigem),
    cepDestino: Number(cepDestino),
    valorNF,
    quantidade,
    peso,
    volume,
    mercadoria: Number(
      process.env.CAMILO_MERCHANDISE_CODE || 1
    )
  };

  /*
   * Campos opcionais do webservice SSW.
   */
  if (cnpjDestinatario) {
    request.cnpjDestinatario = cnpjDestinatario;
  }

  if (cnpjRemetente) {
    request.cnpjRemetente = cnpjRemetente;
  }

  const coletar = String(
    process.env.CAMILO_COLLECT || 'N'
  ).toUpperCase();

  if (['S', 'N'].includes(coletar)) {
    request.coletar = coletar;
  }

  const entregaDificil = String(
    process.env.CAMILO_DIFFICULT_DELIVERY || 'N'
  ).toUpperCase();

  if (['S', 'N'].includes(entregaDificil)) {
    request.entDificil = entregaDificil;
  }

  const destinatarioContribuinte = String(
    process.env.CAMILO_DEST_CONTRIBUINTE || ''
  ).toUpperCase();

  if (['S', 'N'].includes(destinatarioContribuinte)) {
    request.destContribuinte =
      destinatarioContribuinte;
  }

  return request;
}

function decimalValue(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  const number = Number(
    String(value).replace(',', '.')
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizeResponse(data) {
  const errorCode = Number(data.erro);
  const freightValue = decimalValue(
    data.totalFrete
  );

  /*
   * Segundo a SSW:
   * 0 = calculado normalmente
   * 1 = calculado com ressalva
   * -1 e -2 = erro
   */
  const calculated =
    [0, 1].includes(errorCode) &&
    freightValue !== null;

  const warning =
    errorCode === 1 &&
    String(data.mensagem || '').trim();

  return {
    carrierName: 'Camilo',

    status: calculated
      ? 'success'
      : 'error',

    freightValue: calculated
      ? freightValue
      : null,

    deadline:
      calculated && data.prazo
        ? `${data.prazo} dias corridos`
        : null,

    modality: calculated
      ? 'Rodoviário'
      : null,

    message:
      String(data.mensagem || '').trim() ||
      (warning
        ? 'Cotação calculada com ressalvas.'
        : calculated
          ? 'Cotação realizada com sucesso.'
          : 'Não foi possível calcular o frete.'),

    rawResponse: {
      integration: 'Camilo/SSW',
      errorCode,
      cotacao: data
    }
  };
}

async function quoteFreight(payload) {
  const credential = payload.credential || {};

  const hasRegisteredCredential = Boolean(
    credential.usuario &&
      credential.senha
  );

  const useRealApi =
    process.env.CAMILO_API_ENABLED === 'true' ||
    hasRegisteredCredential;

  if (!useRealApi) {
    return mockResult(
      'Camilo',
      payload,
      90,
      9
    );
  }

  let safeRequest = null;

  try {
    const request = buildRequest(payload);

    /*
     * Guardamos somente dados que não são secretos
     * para diagnóstico de erros.
     */
    safeRequest = {
      dominio: request.dominio,
      cnpjPagador: request.cnpjPagador,
      cnpjRemetente: request.cnpjRemetente,
      cnpjDestinatario:
        request.cnpjDestinatario,
      cepOrigem: request.cepOrigem,
      cepDestino: request.cepDestino,
      valorNF: request.valorNF,
      quantidade: request.quantidade,
      peso: request.peso,
      volume: request.volume
    };

    const carrierUrl =
      String(payload.carrier?.apiUrl || '').trim();

    const wsdlUrl =
      carrierUrl.includes('?wsdl')
        ? carrierUrl
        : process.env.CAMILO_QUOTE_URL ||
          'https://ssw.inf.br/ws/sswCotacaoCliente/index.php?wsdl';

    const endpoint =
      carrierUrl &&
      !carrierUrl.includes('?wsdl')
        ? carrierUrl
        : process.env.CAMILO_BASE_URL;

    const client = await soap.createClientAsync(
      wsdlUrl,
      {
        wsdl_options: {
          timeout: 30000
        }
      }
    );

    if (endpoint) {
      client.setEndpoint(endpoint);
    }

console.log('Camilo/SSW — dados da cotação:', {
  tipoFrete: payload.tipoFrete,
  cnpjPagador: request.cnpjPagador,
  cnpjRemetente: request.cnpjRemetente,
  cnpjDestinatario:
    request.cnpjDestinatario || null,
  cepOrigem: request.cepOrigem,
  cepDestino: request.cepDestino,
  valorNF: request.valorNF,
  quantidade: request.quantidade,
  peso: request.peso,
  volume: request.volume
});

    const soapResponse =
  await client.cotarAsync(request);

/*
 * Normalmente o node-soap retorna:
 *
 * índice 0 = resultado interpretado
 * índice 1 = resposta SOAP bruta
 * índice 2 = cabeçalhos
 * índice 3 = requisição bruta
 */
const parsedResult = Array.isArray(
  soapResponse
)
  ? soapResponse[0]
  : soapResponse;

const rawResponse = Array.isArray(
  soapResponse
)
  ? soapResponse[1]
  : null;

/* Primeiro verifica se o node-soap já transformou a cotação em objeto. */
let parsed = findQuoteObject(
  parsedResult
);

/* Se não transformou, procura o XML tanto no resultado quanto na resposta bruta. */
if (!parsed) {
  const quoteXml =
    findQuoteXml(parsedResult) ||
    findQuoteXml(rawResponse);

  if (quoteXml) {
    parsed = parseQuoteXml(quoteXml);
  }
}

if (!parsed) {
  /* Este diagnóstico não imprime as senhas nem a requisição SOAP enviada.*/
  console.error(
    'Diagnóstico da resposta Camilo/SSW:',
    {
      resultType: typeof parsedResult,

      resultKeys:
        parsedResult &&
        typeof parsedResult === 'object'
          ? Object.keys(parsedResult)
          : [],

      rawResponsePreview: String(
        rawResponse || ''
      ).slice(0, 1500)
    }
  );

  throw new Error(
    'A SSW respondeu, mas o conteúdo da cotação não pôde ser interpretado.'
  );
}

return normalizeResponse(parsed);
  } catch (error) {
    const soapFault =
      error.root?.Envelope?.Body?.Fault
        ?.faultstring;

    console.error('Erro Camilo/SSW:', {
      message: error.message,
      fault: soapFault || null,
      request: safeRequest
    });

    return {
      carrierName: 'Camilo',
      status: 'error',
      freightValue: null,
      deadline: null,
      modality: null,
      message:
        soapFault ||
        error.message ||
        'Erro ao consultar a Camilo.',
      rawResponse: {
        integration: 'Camilo/SSW',
        error: error.message,
        requestData: safeRequest
      }
    };
  }
}

module.exports = {
  quoteFreight
};