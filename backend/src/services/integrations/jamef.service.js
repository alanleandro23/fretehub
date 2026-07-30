const axios = require('axios');
const { mockResult } = require('./base');
const { getConfigValue } = require('../config.service');

const tokenCache = new Map();
let lastTrackingRequestAt = 0;
let trackingQueue = Promise.resolve();

function normalizeTrackingUrl(value) {
  const base = String(value || '').trim().replace(/\/$/, '');
  if (!base) return '';
  return /\/rastreamento$/i.test(base) ? base : `${base}/rastreamento`;
}

function runTrackingRequest(operation) {
  const task = trackingQueue.then(async () => {
    const waitMs = Math.max(0, 2100 - (Date.now() - lastTrackingRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastTrackingRequestAt = Date.now();
    return operation();
  });

  trackingQueue = task.catch(() => undefined);
  return task;
}

function onlyNumbers(value) {
  return String(value || '').replace(/\D/g, '');
}

function todayBR() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

function calculateCubage(items = []) {
  return items.reduce((total, item) => {
    const quantidade = Number(item.quantidade || 0);
    const altura = Number(item.altura || 0);
    const comprimento = Number(item.comprimento || 0);
    const largura = Number(item.largura || 0);

    return total + quantidade * altura * comprimento * largura;
  }, 0);
}

function sumVolumes(items = []) {
  return items.reduce((total, item) => {
    return total + Number(item.quantidade || 0);
  }, 0);
}

function sumWeight(items = []) {
  return items.reduce((total, item) => {
    return (
      total +
      Number(item.peso || 0) *
        Number(item.quantidade || 0)
    );
  }, 0);
}

async function getJamefToken(payload = {}, forceRefresh = false) {
  const credential = payload.credential || {};
  const configuredToken = String(
    credential.token || process.env.JAMEF_TOKEN || ''
  ).trim();

  if (configuredToken) return configuredToken;

  const authUrl = process.env.JAMEF_AUTH_URL;
  const username = credential.usuario || process.env.JAMEF_USERNAME;
  const password = credential.senha || process.env.JAMEF_PASSWORD;

  if (!authUrl) {
    throw new Error('JAMEF_AUTH_URL não configurada no arquivo .env.');
  }

  if (!username || !password) {
    throw new Error(
      'Credencial Jamef incompleta. Informe token ou usuário e senha no cadastro de credenciais.'
    );
  }

  // Cada credencial mantém seu próprio token para evitar mistura entre empresas.
  const cacheKey = credential.id
    ? `credential:${credential.id}`
    : `env:${username}`;
  const cached = tokenCache.get(cacheKey);

  if (
    !forceRefresh &&
    cached?.token &&
    cached?.expiresAt &&
    Date.now() < cached.expiresAt
  ) {
    return cached.token;
  }

  const response = await axios.post(
    authUrl,
    { username, password },
    {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    }
  );

  const tokenData = response.data?.dado?.[0] || {};
  const token =
    response.data?.token ||
    response.data?.access_token ||
    response.data?.accessToken ||
    response.data?.jwt ||
    response.data?.data?.token ||
    response.data?.data?.access_token ||
    response.data?.data?.accessToken ||
    tokenData?.accessToken ||
    tokenData?.access_token ||
    tokenData?.token;

  if (!token) {
    throw new Error('Token não encontrado na resposta de autenticação da Jamef.');
  }

  const expiresIn = Number(tokenData?.expiresIn || 3600);
  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + Math.max(expiresIn - 300, 60) * 1000
  });

  return token;
}

function normalizeJamefResponse(data) {
  const item = Array.isArray(data?.dado)
    ? data.dado[0]
    : data?.dado || data;

  const freightValue =
    item?.total ??
    item?.valorTotal ??
    item?.totalFrete ??
    item?.frete ??
    item?.valorFrete ??
    null;

  const deadline =
    item?.previsaoEntrega ??
    item?.prazoEntrega ??
    item?.prazo ??
    item?.diasEntrega ??
    null;

  const modality =
    item?.modalidadeTransporte === '2'
      ? 'Aéreo'
      : 'Rodoviário';

  return {
    carrierName: 'Jamef',
    status: freightValue ? 'success' : 'error',
    freightValue: freightValue ? Number(freightValue) : null,
    deadline: deadline ? String(deadline) : null,
    modality,
    message: data?.mensagem || 'Cotação realizada',
    rawResponse: data
  };
}

function buildJamefPayload(payload) {
  const metragemCubica = calculateCubage(payload.items);

  const quantidadeVolume =
    Number(payload.quantidadeVolumes || 0) ||
    sumVolumes(payload.items) ||
    1;

  const pesoMercadoria =
    Number(payload.pesoTotal || 0) ||
    sumWeight(payload.items) ||
    0.1;

  const documentoDevedor = onlyNumbers(
    payload.documentoPagador ||
      payload.documentoRemetente ||
      process.env.JAMEF_DOCUMENTO_DEVEDOR
  );

  const documentoRemetente = onlyNumbers(
    payload.documentoRemetente ||
      payload.documentoPagador ||
      process.env.JAMEF_DOCUMENTO_REMETENTE ||
      process.env.JAMEF_DOCUMENTO_DEVEDOR
  );

  const documentoDestino = onlyNumbers(
    payload.documentoDestinatario ||
      payload.cnpjDestinatario
  );

  const cepOrigem = onlyNumbers(
    payload.tipoFrete === 'FOB'
      ? payload.cepDestino
      : payload.cepOrigem ||
          process.env.JAMEF_CEP_ORIGEM
  );

  const cepDestino = onlyNumbers(
    payload.tipoFrete === 'FOB'
      ? payload.cepOrigem ||
          process.env.JAMEF_CEP_ORIGEM
      : payload.cepDestino
  );

  const requestBody = {
    tipoTransporte: payload.modal === 'Aéreo' ? '2' : '1',

    documentoDevedor,

    cepOrigem,

    cepDestino,

    quantidadeVolume,

    pesoMercadoria,

    valorNotaFiscal: Number(payload.valorMercadoria || 0),

    metragemCubica: Number(
      (metragemCubica || 0.001).toFixed(4)
    ),

    documentoRemetente,

    documentoDestino,

    dataColeta: todayBR()
  };

  Object.keys(requestBody).forEach((key) => {
    if (
      requestBody[key] === undefined ||
      requestBody[key] === null ||
      requestBody[key] === ''
    ) {
      delete requestBody[key];
    }
  });

  return requestBody;
}

async function postQuoteWithToken(quoteUrl, requestBody, token) {
  return axios.post(quoteUrl, requestBody, {
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
}

async function quoteFreight(payload) {
  const hasRegisteredCredential = Boolean(
  payload.credential?.usuario &&
  payload.credential?.senha
);

const useRealApi =
  process.env.JAMEF_API_ENABLED === 'true' ||
  hasRegisteredCredential;

if (!useRealApi) {
  return mockResult('Jamef', payload, 68, 7);
}

  const quoteUrl = process.env.JAMEF_QUOTE_URL;

  if (!quoteUrl) {
    return {
      carrierName: 'Jamef',
      status: 'error',
      freightValue: null,
      deadline: null,
      modality: null,
      message: 'JAMEF_QUOTE_URL não configurado no .env',
      rawResponse: null
    };
  }

  const requestBody = buildJamefPayload(payload);

  try {
    let token = await getJamefToken(payload);
    let response;

    try {
      response = await postQuoteWithToken(
        quoteUrl,
        requestBody,
        token
      );
    } catch (error) {
      if (error.response?.status === 401) {
        token = await getJamefToken(payload, true);

        response = await postQuoteWithToken(
          quoteUrl,
          requestBody,
          token
        );
      } else {
        throw error;
      }
    }

    return normalizeJamefResponse(response.data);
  } catch (error) {
    console.error('Erro Jamef:', {
        status: error.response?.status || null,
        mensagem:
          error.response?.data?.mensagem ||
          error.response?.data?.message ||
          error.message,
        idCorrelacao:
          error.response?.data?.idCorrelacao || null
      });

    return {
      carrierName: 'Jamef',
      status: 'error',
      freightValue: null,
      deadline: null,
      modality: null,
      message:
        error.response?.data?.message ||
        error.response?.data?.mensagem ||
        error.response?.data?.error ||
        error.message ||
        'Erro ao consultar API Jamef',
      rawResponse: {
        status: error.response?.status,
        data: error.response?.data || null,
        payload: requestBody
      }
    };
  }
}


function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstValue(object, keys = []) {
  if (!object || typeof object !== 'object') return null;

  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return null;
}

function scalarText(value) {
  if (value === undefined || value === null) return null;
  if (!['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return null;
  const text = String(value).trim();
  return text || null;
}

function firstScalarValue(object, keys = []) {
  if (!object || typeof object !== 'object') return null;

  for (const key of keys) {
    const value = scalarText(object[key]);
    if (value) return value;
  }

  return null;
}

function locationParts(value) {
  if (!value) return { cidade: null, uf: null };

  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (!text) return { cidade: null, uf: null };

    const match = text.match(/^(.+?)[\s\/-]+([A-Za-z]{2})$/);
    if (match) {
      return { cidade: match[1].trim(), uf: match[2].toUpperCase() };
    }

    return { cidade: text, uf: null };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return { cidade: null, uf: null };
  }

  return {
    cidade: firstScalarValue(value, [
      'cidade',
      'municipio',
      'localidade',
      'nome',
      'descricao'
    ]),
    uf: firstScalarValue(value, [
      'uf',
      'estado',
      'siglaEstado',
      'sigla'
    ])
  };
}

function meaningfulOccurrence(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();
  if (!text) return null;

  // O campo "status" do envelope pode ser apenas o código HTTP 200.
  if (/^\d{3}$/.test(text) && Number(text) >= 100 && Number(text) <= 599) {
    return null;
  }

  if (/^(OK|SUCCESS|SUCESSO|TRUE)$/i.test(text)) return null;
  return text;
}

function normalizeDateCandidate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  const text = String(value).trim();
  if (!text) return null;

  const brMatch = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (brMatch) {
    const [, day, month, year, hour = '12', minute = '00', second = '00'] = brMatch;
    const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function collectObjects(value, output = [], visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return output;
  visited.add(value);

  if (!Array.isArray(value)) output.push(value);

  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    if (child && typeof child === 'object') {
      collectObjects(child, output, visited);
    }
  }

  return output;
}

function eventFromObject(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

  const description = meaningfulOccurrence(firstScalarValue(item, [
    'descricaoOcorrencia',
    'descricaoStatus',
    'ocorrencia',
    'descricao',
    'situacao',
    'evento',
    'nomeStatus',
    'status',
    'tipo'
  ]));

  const dateValue = firstScalarValue(item, [
    'dataOcorrencia',
    'dataEvento',
    'dataHora',
    'dataStatus',
    'data',
    'dtOcorrencia',
    'dataMovimento',
    'dataAtualizacao'
  ]);

  // Exige texto logístico e data. O envelope { status: 200 } fica de fora.
  if (!description || !dateValue) return null;

  const localOrigem = locationParts(item.localOrigem);
  const localDestino = locationParts(item.localDestino);

  const estadoOrigem =
    firstScalarValue(item, [
      'estadoOrigem',
      'ufOrigem',
      'siglaEstadoOrigem'
    ]) || localOrigem.uf;

  const municipioOrigem =
    firstScalarValue(item, [
      'municipioOrigem',
      'cidadeOrigem'
    ]) || localOrigem.cidade;

  const estadoDestino =
    firstScalarValue(item, [
      'estadoDestino',
      'ufDestino',
      'siglaEstadoDestino'
    ]) || localDestino.uf;

  const municipioDestino =
    firstScalarValue(item, [
      'municipioDestino',
      'cidadeDestino'
    ]) || localDestino.cidade;

  const cidadeEvento = firstScalarValue(item, [
    'municipio',
    'cidade',
    'cidadeEvento',
    'unidade',
    'filial'
  ]);

  const ufEvento = firstScalarValue(item, [
    'estado',
    'uf',
    'ufEvento'
  ]);

  const normalizedDate = normalizeDateCandidate(dateValue);
  const sourceKey = [
    normalizeText(description).toUpperCase(),
    normalizedDate || String(dateValue),
    normalizeText(estadoOrigem).toUpperCase(),
    normalizeText(municipioOrigem).toUpperCase(),
    normalizeText(estadoDestino).toUpperCase(),
    normalizeText(municipioDestino).toUpperCase()
  ].join('|');

  return {
    tipo: description,
    descricao: description,
    dataEvento: normalizedDate || dateValue,
    cidade: cidadeEvento || municipioOrigem || null,
    uf: ufEvento || estadoOrigem || null,
    estadoOrigem: estadoOrigem || null,
    municipioOrigem: municipioOrigem || null,
    estadoDestino: estadoDestino || null,
    municipioDestino: municipioDestino || null,
    sourceKey,
    rawResponse: item
  };
}

function extractJamefEvents(data) {
  const objects = collectObjects(data);
  const unique = new Map();

  for (const object of objects) {
    const event = eventFromObject(object);
    if (!event) continue;

    if (!unique.has(event.sourceKey)) {
      unique.set(event.sourceKey, event);
    }
  }

  return [...unique.values()].sort((a, b) => {
    const aTime = new Date(a.dataEvento).getTime();
    const bTime = new Date(b.dataEvento).getTime();

    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return -1;
    if (Number.isNaN(bTime)) return 1;
    return aTime - bTime;
  });
}

function deepFirstValue(data, keys = []) {
  const objects = collectObjects(data);
  for (const object of objects) {
    const value = firstValue(object, keys);
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
}

function deepFirstScalarValue(data, keys = []) {
  const objects = collectObjects(data);
  for (const object of objects) {
    const value = firstScalarValue(object, keys);
    if (value) return value;
  }
  return null;
}

function firstShipmentRecord(data) {
  const groups = Array.isArray(data?.dado)
    ? data.dado
    : data?.dado
      ? [data.dado]
      : [];

  for (const group of groups) {
    if (Array.isArray(group?.rastreamento) && group.rastreamento.length) {
      return group.rastreamento[0];
    }
  }

  return null;
}

function extractShipmentSummary(data, events = []) {
  const latestEvent = events.length ? events[events.length - 1] : null;
  const shipment = firstShipmentRecord(data) || {};
  const remetente = shipment.remetente || {};
  const destinatario = shipment.destinatario || {};
  const frete = shipment.frete || {};
  const conhecimento = shipment.conhecimento || {};

  // O destino geral é o destinatário final da carga. Não usar localDestino
  // da ocorrência, pois ele representa apenas a próxima unidade operacional.
  const cidadeDestino =
    firstScalarValue(destinatario, ['cidade', 'municipio', 'localidade']) ||
    deepFirstScalarValue(data, [
      'municipioDestino',
      'cidadeDestino',
      'destinoMunicipio',
      'localidadeDestino'
    ]) ||
    latestEvent?.municipioDestino ||
    null;

  const ufDestino =
    firstScalarValue(destinatario, ['uf', 'estado', 'siglaEstado']) ||
    deepFirstScalarValue(data, [
      'estadoDestino',
      'ufDestino',
      'destinoUf',
      'siglaEstadoDestino'
    ]) ||
    latestEvent?.estadoDestino ||
    null;

  const cidadeOrigem =
    firstScalarValue(remetente, ['cidade', 'municipio', 'localidade']) ||
    deepFirstScalarValue(data, [
      'municipioOrigem',
      'cidadeOrigem',
      'origemMunicipio',
      'localidadeOrigem'
    ]) ||
    latestEvent?.municipioOrigem ||
    null;

  const ufOrigem =
    firstScalarValue(remetente, ['uf', 'estado', 'siglaEstado']) ||
    deepFirstScalarValue(data, [
      'estadoOrigem',
      'ufOrigem',
      'origemUf',
      'siglaEstadoOrigem'
    ]) ||
    latestEvent?.estadoOrigem ||
    null;

  return {
    cidadeDestino,
    ufDestino,
    cidadeOrigem,
    ufOrigem,
    previsaoEntrega:
      firstScalarValue(frete, [
        'previsaoEntrega',
        'dataPrevisaoEntrega',
        'dataPrevistaEntrega',
        'previsao'
      ]) ||
      deepFirstScalarValue(data, [
        'previsaoEntrega',
        'dataPrevisaoEntrega',
        'dataPrevistaEntrega',
        'previsao'
      ]),
    dataEntrega:
      firstScalarValue(frete, [
        'dataEntrega',
        'dataEntregaRealizada',
        'dataEfetivaEntrega'
      ]) ||
      deepFirstScalarValue(data, [
        'dataEntrega',
        'dataEntregaRealizada',
        'dataEfetivaEntrega'
      ]),
    conhecimento:
      firstScalarValue(conhecimento, ['numero', 'numeroConhecimento', 'cte']) ||
      deepFirstScalarValue(data, [
        'numeroConhecimento',
        'numeroCte'
      ])
  };
}

async function trackShipment(payload = {}) {
  try {
    const token = await getJamefToken(payload);

    const trackingUrl = normalizeTrackingUrl(
      await getConfigValue('JAMEF_TRACKING_URL', '')
    );

    if (!trackingUrl) {
      throw new Error(
        'URL de tracking da Jamef não configurada. Acesse Tracking de cargas > Configurar tracking.'
      );
    }

    const documentoPagadorFrete = onlyNumbers(payload.documento);
    if (!documentoPagadorFrete) {
      throw new Error('Informe o CNPJ/CPF do pagador do frete para consultar a Jamef.');
    }

    if (!payload.notaFiscal && !payload.conhecimento) {
      throw new Error('A Jamef exige o número da Nota Fiscal ou do Conhecimento/CT-e.');
    }

    const params = {
      documentoPagadorFrete,
      numeroNotaFiscal: payload.notaFiscal || undefined,
      numeroConhecimento: payload.conhecimento || undefined
    };

    Object.keys(params).forEach((key) => {
      if (
        params[key] === undefined ||
        params[key] === null ||
        params[key] === ''
      ) {
        delete params[key];
      }
    });

    console.log('Tracking Jamef — consulta iniciada:', {
      endpoint: trackingUrl,
      documentoPagadorFrete,
      numeroNotaFiscal: params.numeroNotaFiscal || null,
      numeroConhecimento: params.numeroConhecimento || null
    });

    const response = await runTrackingRequest(() =>
      axios.get(trackingUrl, {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
          accept: 'application/json'
        },
        timeout: 30000
      })
    );

    const eventos = extractJamefEvents(response.data);
    const summary = extractShipmentSummary(response.data, eventos);
    const latestEvent = eventos.length ? eventos[eventos.length - 1] : null;

    const fallbackOccurrence = meaningfulOccurrence(deepFirstValue(response.data, [
      'ultimaOcorrencia',
      'descricaoOcorrencia',
      'descricaoStatus',
      'situacao'
    ]));

    const ultimaOcorrencia =
      latestEvent?.descricao ||
      fallbackOccurrence ||
      'Carga localizada na Jamef';

    const deliveredText = normalizeText(
      `${ultimaOcorrencia} ${summary.dataEntrega || ''}`
    ).toUpperCase();

    const status = deliveredText.includes('ENTREG')
      ? 'Entregue'
      : 'Em trânsito';

    console.log('Tracking Jamef — resposta interpretada:', {
      httpStatus: response.status,
      eventosEncontrados: eventos.length,
      ultimaOcorrencia,
      previsaoEntrega: summary.previsaoEntrega || null,
      origem:
        summary.cidadeOrigem || summary.ufOrigem
          ? `${summary.cidadeOrigem || '-'}/${summary.ufOrigem || '-'}`
          : null,
      destino:
        summary.cidadeDestino || summary.ufDestino
          ? `${summary.cidadeDestino || '-'}/${summary.ufDestino || '-'}`
          : null
    });

    if (process.env.TRACKING_DEBUG === 'true') {
      console.dir(response.data, { depth: 8, colors: false });
    }

    return {
      transportadora: 'Jamef',
      status,
      cidade: summary.cidadeDestino,
      uf: summary.ufDestino,
      cidadeOrigem: summary.cidadeOrigem,
      ufOrigem: summary.ufOrigem,
      previsaoEntrega: summary.previsaoEntrega || null,
      dataEntrega: summary.dataEntrega || null,
      ultimaOcorrencia,
      dataEvento: latestEvent?.dataEvento || null,
      notaFiscal: payload.notaFiscal || null,
      pedido: payload.pedido || null,
      conhecimento: summary.conhecimento || payload.conhecimento || null,
      eventos,
      rawResponse: response.data
    };
  } catch (error) {
    console.error(
      'Erro Tracking Jamef:',
      JSON.stringify(error.response?.data || error.message, null, 2)
    );

    throw new Error(
      error.response?.data?.mensagem ||
        error.response?.data?.message ||
        error.message ||
        'Erro tracking Jamef'
    );
  }
}

module.exports = {
  quoteFreight,
  trackShipment
};