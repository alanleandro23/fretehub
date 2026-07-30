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
    if (object?.[key] !== undefined && object?.[key] !== null && object?.[key] !== '') {
      return object[key];
    }
  }
  return null;
}

function trackingRows(data) {
  if (Array.isArray(data)) return data;

  const candidates = [
    data?.eventos,
    data?.ocorrencias,
    data?.tracking,
    data?.historico,
    data?.timeline,
    data?.data?.eventos,
    data?.data?.ocorrencias,
    data?.data?.tracking
  ];

  return candidates.find(Array.isArray) || [];
}

async function trackShipment(payload = {}) {
  const credential = payload.credential || {};
  const trackingUrl = await getConfigValue('BRASPRESS_TRACKING_URL', '');

  if (!trackingUrl) {
    throw new Error('URL de tracking da Braspress não configurada. Acesse Tracking de cargas > Configurar tracking.');
  }

  const username = String(
    credential.usuario || process.env.BRASPRESS_USERNAME || ''
  ).trim();
  const password = String(
    credential.senha || process.env.BRASPRESS_PASSWORD || ''
  );

  if (!username || !password) {
    throw new Error('Credencial Braspress incompleta para consulta de tracking.');
  }

  const params = {
    cnpj: onlyNumbers(payload.documento) || undefined,
    cnpjTomador: onlyNumbers(payload.documento) || undefined,
    notaFiscal: payload.notaFiscal || undefined,
    pedido: payload.pedido || undefined,
    conhecimento: payload.conhecimento || undefined
  };

  Object.keys(params).forEach((key) => {
    if (params[key] === undefined || params[key] === null || params[key] === '') {
      delete params[key];
    }
  });

  const response = await axios.get(trackingUrl, {
    params,
    auth: { username, password },
    timeout: 30000,
    headers: { Accept: 'application/json' }
  });

  const data = response.data;
  const raw =
    data?.conhecimentos?.[0] ||
    data?.documentos?.[0] ||
    data?.data?.[0] ||
    data?.data ||
    data;

  const rows = trackingRows(raw);
  const latest = rows.length ? rows[rows.length - 1] : null;

  return {
    transportadora: 'Braspress',
    status: firstValue(raw, ['status', 'situacao', 'descricaoStatus']) ||
      firstValue(latest, ['status', 'tipo', 'ocorrencia', 'descricao']) ||
      'Em trânsito',
    cidade: firstValue(raw, ['cidadeDestino', 'cidade']) || firstValue(latest, ['cidade']),
    uf: firstValue(raw, ['ufDestino', 'uf']) || firstValue(latest, ['uf']),
    previsaoEntrega: firstValue(raw, ['previsaoEntrega', 'dataPrevisaoEntrega', 'previsao']),
    dataEntrega: firstValue(raw, ['dataEntrega', 'entrega']),
    ultimaOcorrencia: firstValue(raw, ['ultimaOcorrencia', 'descricaoOcorrencia']) ||
      firstValue(latest, ['descricao', 'ocorrencia', 'status']),
    notaFiscal: payload.notaFiscal || firstValue(raw, ['notaFiscal', 'numeroNota']),
    pedido: payload.pedido || firstValue(raw, ['pedido', 'numeroPedido']),
    conhecimento: payload.conhecimento || firstValue(raw, ['conhecimento', 'cte', 'numeroConhecimento']),
    eventos: rows.map((event) => ({
      tipo: firstValue(event, ['tipo', 'status', 'codigo']) || 'OCORRENCIA',
      descricao: firstValue(event, ['descricao', 'ocorrencia', 'status']) || 'Evento logístico',
      dataEvento: firstValue(event, ['dataEvento', 'data', 'dataOcorrencia', 'dataHora']),
      cidade: firstValue(event, ['cidade']),
      uf: firstValue(event, ['uf'])
    })),
    rawResponse: data
  };
}

module.exports = {
  quoteFreight,
  trackShipment
};