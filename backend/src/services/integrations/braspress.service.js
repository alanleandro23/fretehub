const axios = require('axios');
const { mockResult } = require('./base');
const { getConfigValue } = require('../config.service');

function onlyNumbers(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseTipoFrete(tipoFrete) {
  const tipo = String(tipoFrete || '').toUpperCase();
  if (tipo === 'FOB') return '2';
  if (tipo === 'TERCEIROS') return '3';
  return '1';
}

function parseModal(modal) {
  return modal === 'Aéreo' ? 'A' : 'R';
}

function toMeters(value) {
  const n = Number(value || 0);

  // Se vier da tela em centímetros, converte para metros.
  if (n > 3) {
    return Number((n / 100).toFixed(4));
  }

  return n;
}

function buildCubagem(items = []) {
  return items.map((item) => ({
    comprimento: toMeters(item.comprimento),
    largura: toMeters(item.largura),
    altura: toMeters(item.altura),
    volumes: Number(item.quantidade || 1)
  }));
}

function sumVolumes(items = []) {
  return items.reduce(
    (total, item) => total + Number(item.quantidade || 0),
    0
  );
}

function sumWeight(items = []) {
  // Igual ao portal Braspress: considera o peso informado como peso total do volume/item,
  // sem multiplicar pela quantidade.
  return items.reduce(
    (total, item) => total + Number(item.peso || 0),
    0
  );
}

function buildPayload(payload) {
  return {
    cnpjRemetente: Number(
      onlyNumbers(
        payload.documentoRemetente ||
          payload.company?.cnpj ||
          process.env.BRASPRESS_CNPJ_REMETENTE ||
          process.env.BRASPRESS_CNPJ
      )
    ),

    cnpjDestinatario: Number(
      onlyNumbers(payload.cnpjDestinatario)
    ),

    cnpjConsignado:
      String(payload.tipoFrete || '').toUpperCase() === 'TERCEIROS'
        ? Number(
            onlyNumbers(
              payload.cnpjTerceiro ||
                payload.documentoTerceiro ||
                payload.documentoPagador
            )
          )
        : undefined,

    modal: parseModal(payload.modal),

    tipoFrete: parseTipoFrete(payload.tipoFrete),

    cepOrigem: Number(
      onlyNumbers(payload.cepOrigem)
    ),

    cepDestino: Number(
      onlyNumbers(payload.cepDestino)
    ),

    vlrMercadoria: Number(payload.valorMercadoria || 0),

    peso:
      Number(payload.pesoTotal || 0) ||
      sumWeight(payload.items),

    volumes:
      Number(payload.quantidadeVolumes || 0) ||
      sumVolumes(payload.items),

    cubagem: buildCubagem(payload.items)
  };
}

function normalizeResponse(data) {
  return {
    carrierName: 'Braspress',
    status: data?.totalFrete ? 'success' : 'error',

    freightValue: data?.totalFrete
      ? Number(data.totalFrete)
      : null,

    deadline: data?.prazo
      ? `${data.prazo} dias`
      : null,

    modality: 'Rodoviário',

    message: data?.message || 'Cotação realizada',

    rawResponse: data
  };
}

async function quoteFreight(payload) {
  const credential = payload.credential || {};

  const hasRegisteredCredential = Boolean(
    credential.usuario &&
    credential.senha
  );

  const useRealApi =
    process.env.BRASPRESS_API_ENABLED === 'true' ||
    hasRegisteredCredential;

  if (!useRealApi) {
    return mockResult('Braspress', payload, 82, 5);
  }

  try {
    const username = String(
      credential.usuario ||
      process.env.BRASPRESS_USERNAME ||
      ''
    ).trim();

    const password = String(
      credential.senha ||
      process.env.BRASPRESS_PASSWORD ||
      ''
    );

    const quoteUrl =
      payload.carrier?.apiUrl ||
      process.env.BRASPRESS_QUOTE_URL;

    if (!quoteUrl) {
      throw new Error(
        'URL de cotação da Braspress não configurada.'
      );
    }

    if (!username || !password) {
      throw new Error(
        'Cadastre usuário e senha na credencial da Braspress.'
      );
    }

    const requestBody = buildPayload(payload);

    const auth = Buffer.from(
      `${username}:${password}`,
      'utf8'
    ).toString('base64');

    const response = await axios.post(
      quoteUrl,
      requestBody,
      {
        timeout: 30000,
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }
    );

    return normalizeResponse(response.data);
  } catch (error) {
    console.error('Erro Braspress:', {
        status: error.response?.status || null,
        mensagem:
          error.response?.data?.message ||
          error.message,
        erro:
          error.response?.data?.error || null
      });

    let message =
      error.response?.data?.message ||
      error.message ||
      'Erro Braspress';

    if (
      JSON.stringify(error.response?.data || '')
        .includes('CEP DESTINO NÃO ENCONTRADO')
    ) {
      message =
        'CEP destino não localizado na base operacional Braspress';
    }

    return {
      carrierName: 'Braspress',
      status: 'error',
      freightValue: null,
      deadline: null,
      modality: null,
      message,
      rawResponse: error.response?.data || null
    };
  }
}



function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
}

function normalizeEventText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeTrackingBaseUrl(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) return '';

  const v3Match = url.match(/^(https?:\/\/[^?#]+?\/v3\/tracking)(?:\/.*)?$/i);
  if (v3Match) return v3Match[1];

  if (/\/v[12]\/tracking(?:\/.*)?$/i.test(url)) {
    return url.replace(/\/v[12]\/tracking(?:\/.*)?$/i, '/v3/tracking');
  }

  if (/^https?:\/\/api\.braspress\.com(?:\/home)?$/i.test(url)) {
    return url.replace(/\/home$/i, '') + '/v3/tracking';
  }

  return `${url}/v3/tracking`;
}

function buildTrackingRequest(baseUrl, payload = {}) {
  const cnpj = onlyNumbers(payload.documento);
  const notaFiscal = onlyNumbers(payload.notaFiscal);
  const pedido = onlyNumbers(payload.pedido);

  if (cnpj.length !== 14) {
    throw new Error('Informe o CNPJ do tomador do frete com 14 dígitos.');
  }

  if (notaFiscal) {
    return {
      endpoint: `${baseUrl}/byNf/${encodeURIComponent(cnpj)}/${encodeURIComponent(notaFiscal)}/json`,
      searchType: 'notaFiscal',
      searchValue: notaFiscal,
      cnpj
    };
  }

  if (pedido) {
    return {
      endpoint: `${baseUrl}/byNumPedido/${encodeURIComponent(cnpj)}/${encodeURIComponent(pedido)}/json`,
      searchType: 'pedido',
      searchValue: pedido,
      cnpj
    };
  }

  throw new Error('Para rastrear pela Braspress, informe a Nota Fiscal ou o número do Pedido.');
}

function normalizedKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function parseJsonValue(value) {
  if (typeof value !== 'string') return value;

  const text = value.trim();
  if (!text || !['[', '{'].includes(text[0])) return value;

  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function isEventLike(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const keys = Object.keys(value).map(normalizedKey);
  const hasDescription = keys.some((key) => [
    'descricao',
    'ocorrencia',
    'status',
    'evento',
    'situacao',
    'titulo',
    'nomeocorrencia'
  ].includes(key));
  const hasDate = keys.some((key) => [
    'data',
    'dataevento',
    'dataocorrencia',
    'datahora',
    'dtevento',
    'dhevento',
    'datastatus',
    'dataatualizacao'
  ].includes(key));

  return hasDescription || (hasDate && keys.some((key) => key.includes('ocorr')));
}

function collectionItems(value, depth = 0, seen = new WeakSet()) {
  if (value === undefined || value === null || depth > 8) return [];

  const parsed = parseJsonValue(value);

  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => {
      const normalized = parseJsonValue(item);
      if (isEventLike(normalized)) return [normalized];
      if (normalized && typeof normalized === 'object') {
        const nested = collectionItems(normalized, depth + 1, seen);
        return nested.length ? nested : [normalized];
      }
      return [];
    });
  }

  if (!parsed || typeof parsed !== 'object') return [];
  if (seen.has(parsed)) return [];
  seen.add(parsed);

  if (isEventLike(parsed)) return [parsed];

  const wrapperNames = new Set([
    'items',
    'item',
    'itens',
    'lista',
    'dados',
    'data',
    'registros',
    'registro',
    'eventos',
    'evento',
    'timeline',
    'linhadotempo',
    'historico',
    'ocorrencias',
    'ocorrencia',
    'content',
    'conteudo'
  ]);

  const entries = Object.entries(parsed);
  const wrapped = entries
    .filter(([key]) => wrapperNames.has(normalizedKey(key)))
    .flatMap(([, item]) => collectionItems(item, depth + 1, seen));

  if (wrapped.length) return wrapped;

  const numericEntries = entries.filter(([key]) => /^\d+$/.test(key));
  if (numericEntries.length) {
    return numericEntries.flatMap(([, item]) => {
      const normalized = parseJsonValue(item);
      if (isEventLike(normalized)) return [normalized];
      return collectionItems(normalized, depth + 1, seen);
    });
  }

  return [];
}

function isTimelineContainerKey(key) {
  const normalized = normalizedKey(key);
  return normalized.includes('timeline') ||
    normalized.includes('linhadotempo') ||
    normalized === 'historico' ||
    normalized === 'eventos' ||
    normalized === 'evento';
}

function isOccurrenceContainerKey(key) {
  const normalized = normalizedKey(key);
  return normalized.includes('ocorrenc') ||
    normalized.includes('pendencia') ||
    normalized.includes('divergencia');
}

function findNamedCollections(root, matcher, depth = 0, seen = new WeakSet()) {
  if (!root || typeof root !== 'object' || depth > 8) return [];
  if (seen.has(root)) return [];
  seen.add(root);

  const matches = [];

  for (const [key, value] of Object.entries(root)) {
    if (matcher(key)) matches.push(value);

    const parsed = parseJsonValue(value);
    if (parsed && typeof parsed === 'object') {
      matches.push(...findNamedCollections(parsed, matcher, depth + 1, seen));
    }
  }

  return matches;
}

function asArray(value) {
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const values = Object.values(parsed);
    if (values.length && Object.keys(parsed).every((key) => /^\d+$/.test(key))) {
      return values;
    }
    return [parsed];
  }
  return [];
}

function findKnowledge(data, payload = {}) {
  const conhecimentos = asArray(data?.conhecimentos);

  if (!conhecimentos.length) {
    throw new Error(
      data?.message ||
      data?.mensagem ||
      'A Braspress não retornou conhecimentos para os dados informados.'
    );
  }

  const notaFiscal = onlyNumbers(payload.notaFiscal);
  if (notaFiscal) {
    const matching = conhecimentos.find((item) =>
      asArray(item?.notasFiscais).some((nota) =>
        onlyNumbers(nota?.numero) === notaFiscal
      )
    );
    if (matching) return matching;
  }

  return conhecimentos[0];
}

function eventKey(knowledge, description, date, source) {
  return [
    'BRASPRESS',
    onlyNumbers(knowledge?.numero),
    normalizeEventText(source),
    normalizeEventText(description),
    String(date || '').trim()
  ].join(':');
}

function eventDescription(event) {
  return String(firstValue(event, [
    'descricao',
    'ocorrencia',
    'status',
    'evento',
    'situacao',
    'titulo',
    'nomeOcorrencia'
  ]) || '').trim();
}

function eventDate(event) {
  const date = firstValue(event, [
    'data',
    'dataEvento',
    'dataOcorrencia',
    'dataHora',
    'dtEvento',
    'dhEvento',
    'dataStatus',
    'dataAtualizacao'
  ]);
  const time = firstValue(event, ['hora', 'horario', 'horaEvento']);

  if (!date) return null;
  const text = String(date).trim();

  if (time && /^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    return `${text} ${String(time).trim()}`;
  }

  return date;
}

function eventTimestamp(value) {
  if (!value) return 0;
  const text = String(value).trim();

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = br;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).getTime() || 0;
  }

  const parsed = new Date(text).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildTrackingEvents(knowledge, data) {
  const timelineContainers = [
    knowledge?.timeline,
    knowledge?.timeLine,
    knowledge?.linhaTempo,
    knowledge?.linhaDoTempo,
    knowledge?.historico,
    knowledge?.eventos,
    ...findNamedCollections(knowledge, isTimelineContainerKey),
    ...findNamedCollections(data, isTimelineContainerKey)
  ];

  const occurrenceContainers = [
    knowledge?.ocorrencias,
    knowledge?.ocorrencia,
    knowledge?.pendencias,
    knowledge?.divergencias,
    ...findNamedCollections(knowledge, isOccurrenceContainerKey),
    ...findNamedCollections(data, isOccurrenceContainerKey)
  ];

  const sourceEvents = [
    ...timelineContainers.flatMap((container) =>
      collectionItems(container).map((event) => ({ ...event, source: 'timeline' }))
    ),
    ...occurrenceContainers.flatMap((container) =>
      collectionItems(container).map((event) => ({ ...event, source: 'ocorrencia' }))
    )
  ];

  if (!sourceEvents.length && knowledge?.ultimaOcorrencia) {
    sourceEvents.push({
      descricao: knowledge.ultimaOcorrencia,
      data: knowledge.dataOcorrencia,
      source: 'ultimaOcorrencia'
    });
  }

  const unique = new Map();

  for (const event of sourceEvents) {
    const description = eventDescription(event);
    const date = eventDate(event);

    if (!description) continue;

    const source = String(event.source || 'timeline');
    // A mesma ocorrência pode vir simultaneamente em timeline e ocorrencias.
    // O texto e a data identificam o evento logístico para evitar duplicação.
    const dedupeKey = [
      normalizeEventText(description),
      String(date || '').trim()
    ].join('|');

    if (unique.has(dedupeKey)) continue;

    unique.set(dedupeKey, {
      tipo: description,
      descricao: description,
      dataEvento: date,
      sourceKey: eventKey(knowledge, description, date, source),
      estadoOrigem: firstValue(event, ['ufOrigem', 'estadoOrigem']) || firstValue(knowledge, ['ufColeta']),
      municipioOrigem: firstValue(event, ['cidadeOrigem', 'municipioOrigem']) || firstValue(knowledge, ['cidadeColeta', 'origem']),
      estadoDestino: firstValue(event, ['ufDestino', 'estadoDestino']) || firstValue(knowledge, ['uf']),
      municipioDestino: firstValue(event, ['cidadeDestino', 'municipioDestino']) || firstValue(knowledge, ['cidade']),
      rawResponse: {
        provider: 'Braspress',
        source,
        event
      }
    });
  }

  return [...unique.values()].sort((a, b) =>
    eventTimestamp(a.dataEvento) - eventTimestamp(b.dataEvento)
  );
}

function apiErrorMessage(error) {
  const body = error.response?.data;
  const list = Array.isArray(body?.errorList)
    ? body.errorList
      .map((item) => item?.message || item?.mensagem || item?.descricao)
      .filter(Boolean)
      .join('; ')
    : '';

  return list ||
    body?.message ||
    body?.mensagem ||
    body?.error ||
    error.message ||
    'Falha na consulta da Braspress.';
}

async function trackShipment(payload = {}) {
  const credential = payload.credential || {};
  const configuredUrl = await getConfigValue('BRASPRESS_TRACKING_URL', '');
  const baseUrl = normalizeTrackingBaseUrl(configuredUrl);

  if (!baseUrl) {
    throw new Error(
      'URL de tracking da Braspress não configurada. Acesse Tracking de cargas > Configurar tracking.'
    );
  }

  const username = String(
    credential.usuario || process.env.BRASPRESS_USERNAME || ''
  ).trim();
  const password = String(
    credential.senha || process.env.BRASPRESS_PASSWORD || ''
  );

  if (!username || !password) {
    throw new Error(
      'Credencial Braspress incompleta. Cadastre o usuário e a senha da API para esta empresa.'
    );
  }

  const request = buildTrackingRequest(baseUrl, payload);

  console.log('Tracking Braspress — consulta iniciada:', {
    endpoint: request.endpoint,
    cnpjTomador: request.cnpj,
    tipoConsulta: request.searchType,
    valorConsulta: request.searchValue
  });

  try {
    const response = await axios.get(request.endpoint, {
      auth: { username, password },
      timeout: 30000,
      headers: { Accept: 'application/json' }
    });

    const data = response.data || {};
    const knowledge = findKnowledge(data, payload);
    const events = buildTrackingEvents(knowledge, data);
    const latestEvent = events.length ? events[events.length - 1] : null;
    const firstInvoice = asArray(knowledge?.notasFiscais)[0] || null;

    const result = {
      transportadora: 'Braspress',
      status:
        firstValue(knowledge, ['status']) ||
        latestEvent?.descricao ||
        'Em trânsito',
      cidade: firstValue(knowledge, ['cidade']),
      uf: firstValue(knowledge, ['uf']),
      cidadeOrigem: firstValue(knowledge, ['cidadeColeta', 'origem']),
      ufOrigem: firstValue(knowledge, ['ufColeta']),
      previsaoEntrega: firstValue(knowledge, ['previsaoEntrega']),
      dataEntrega: firstValue(knowledge, ['dataEntrega']),
      dataEvento:
        firstValue(knowledge, ['dataOcorrencia']) ||
        latestEvent?.dataEvento ||
        null,
      ultimaOcorrencia:
        firstValue(knowledge, ['ultimaOcorrencia']) ||
        latestEvent?.descricao ||
        firstValue(knowledge, ['status']),
      notaFiscal:
        payload.notaFiscal ||
        firstValue(firstInvoice, ['numero']),
      pedido: payload.pedido || null,
      conhecimento:
        payload.conhecimento ||
        firstValue(knowledge, ['numero']),
      eventos: events,
      rawResponse: data
    };

    console.log('Tracking Braspress — resposta interpretada:', {
      httpStatus: response.status,
      conhecimentosEncontrados: asArray(data?.conhecimentos).length,
      eventosEncontrados: events.length,
      conhecimento: result.conhecimento || null,
      ultimaOcorrencia: result.ultimaOcorrencia || null,
      previsaoEntrega: result.previsaoEntrega || null,
      destino: result.cidade && result.uf
        ? `${result.cidade}/${result.uf}`
        : result.cidade || result.uf || null
    });

    if (String(process.env.TRACKING_DEBUG || '').toLowerCase() === 'true') {
      console.dir(data, { depth: null });
    }

    return result;
  } catch (error) {
    const message = apiErrorMessage(error);

    console.error('Erro Tracking Braspress:', {
      status: error.response?.status || null,
      endpoint: request.endpoint,
      mensagem: message
    });

    throw new Error(`Braspress: ${message}`);
  }
}

module.exports = {
  quoteFreight,
  trackShipment
};
