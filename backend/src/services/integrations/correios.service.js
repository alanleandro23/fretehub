const axios = require('axios');

const tokenCache = new Map();
const tokenPending = new Map();

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeEnvironment(value) {
  return String(value || '').toUpperCase() === 'PRODUCAO'
    ? 'PRODUCAO'
    : 'HOMOLOGACAO';
}

function apiHost(environment) {
  const normalized = normalizeEnvironment(environment);
  const configured = normalized === 'PRODUCAO'
    ? process.env.CORREIOS_PRODUCTION_BASE_URL
    : process.env.CORREIOS_HOMOLOGATION_BASE_URL;

  if (String(configured || '').trim()) {
    return String(configured).trim().replace(/\/$/, '');
  }

  return normalized === 'PRODUCAO'
    ? 'https://api.correios.com.br'
    : 'https://apihom.correios.com.br';
}

function parseDecimal(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const normalized = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function safeInteger(value) {
  const number = Number.parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(number) ? number : null;
}

function metersToCentimeters(value) {
  const centimeters = Math.ceil(Number(value || 0) * 100);
  return Math.max(1, centimeters);
}

function kilogramsToGrams(value) {
  const grams = Math.ceil(Number(value || 0) * 1000);
  return Math.max(1, grams);
}

function parseProducts(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          const [code, ...nameParts] = item.split(':');
          const normalizedCode = onlyDigits(code);
          return normalizedCode
            ? { code: normalizedCode, name: nameParts.join(':').trim() || normalizedCode }
            : null;
        }

        const code = onlyDigits(item?.code || item?.codigo || item?.coProduto);
        if (!code) return null;
        return {
          code,
          name: String(item?.name || item?.nome || item?.modalidade || code).trim()
        };
      })
      .filter(Boolean);
  }

  return String(value || '')
    .split(/[;,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [codePart, ...nameParts] = entry.split(':');
      const code = onlyDigits(codePart);
      if (!code) return null;
      return {
        code,
        name: nameParts.join(':').trim() || code
      };
    })
    .filter(Boolean);
}

function credentialConfig(payload = {}) {
  const credential = payload.credential || {};
  const extra = credential.configuracao || {};
  const environment = normalizeEnvironment(
    credential.ambiente || payload.carrier?.ambiente || process.env.CORREIOS_ENV
  );

  const username = String(
    credential.usuario || process.env.CORREIOS_USERNAME || ''
  ).trim();
  const password = String(
    credential.senha || process.env.CORREIOS_PASSWORD || ''
  );
  const staticToken = String(
    credential.token || process.env.CORREIOS_TOKEN || ''
  ).trim();
  const card = onlyDigits(
    credential.codigoCliente || process.env.CORREIOS_CARD || process.env.CORREIOS_CARTAO_POSTAGEM
  );
  const contract = onlyDigits(
    credential.contrato || process.env.CORREIOS_CONTRACT || process.env.CORREIOS_CONTRATO
  );
  const dr = safeInteger(
    extra.correiosDr ?? extra.dr ?? process.env.CORREIOS_DR
  );
  const products = parseProducts(
    extra.correiosProdutos ?? extra.produtos ?? process.env.CORREIOS_PRODUCTS
  );

  return {
    environment,
    host: apiHost(environment),
    username,
    password,
    staticToken,
    card,
    contract,
    dr,
    products
  };
}

function cacheKey(config, authMode = 'auto') {
  return [
    config.environment,
    authMode,
    config.username,
    config.card,
    config.contract,
    config.dr || ''
  ].join('|');
}

function decodeJwtExpiry(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return payload.exp ? new Date(Number(payload.exp) * 1000) : null;
  } catch {
    return null;
  }
}

function tokenIsValid(entry) {
  if (!entry?.token) return false;
  if (!entry.expiresAt) return true;
  return entry.expiresAt.getTime() - Date.now() > 120000;
}

function requireTokenCredentials(config, authMode = 'auto') {
  if (config.staticToken) return;
  if (!config.username || !config.password) {
    throw new Error(
      'Credencial dos Correios incompleta: informe o usuário idCorreios e o código de acesso à API.'
    );
  }
  if (authMode === 'contract' && !config.contract) {
    throw new Error(
      'Para consultar CEP nos Correios, informe o número do contrato na credencial.'
    );
  }
  if (authMode === 'card' && !config.card) {
    throw new Error(
      'Para gerar o token por cartão de postagem, informe o cartão na credencial.'
    );
  }
  if (authMode === 'auto' && !config.card && !config.contract) {
    throw new Error(
      'Credencial dos Correios incompleta: informe o cartão de postagem ou o contrato.'
    );
  }
}

async function generateToken(config, force = false, authMode = 'auto') {
  requireTokenCredentials(config, authMode);

  // Um token manual é tratado como credencial administrada externamente.
  // Nesse caso não há como renová-lo sem usuário/código de acesso, portanto
  // o parâmetro force não deve desconsiderá-lo.
  if (config.staticToken) {
    return {
      token: config.staticToken,
      expiresAt: decodeJwtExpiry(config.staticToken),
      source: 'static'
    };
  }

  const key = cacheKey(config, authMode);
  const cached = tokenCache.get(key);
  if (!force && tokenIsValid(cached)) return cached;

  const pending = tokenPending.get(key);
  if (!force && pending) return pending;

  const tokenRequest = (async () => {
    const usesCard = authMode === 'card' || (authMode === 'auto' && Boolean(config.card));
    const endpoint = usesCard
      ? '/token/v1/autentica/cartaopostagem'
      : '/token/v1/autentica/contrato';

    const body = usesCard
      ? {
          numero: config.card,
          ...(config.contract ? { contrato: config.contract } : {}),
          ...(config.dr != null ? { dr: config.dr } : {})
        }
      : {
          numero: config.contract,
          ...(config.dr != null ? { dr: config.dr } : {})
        };

    const response = await axios.post(`${config.host}${endpoint}`, body, {
      auth: {
        username: config.username,
        password: config.password
      },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });

    const token = String(response.data?.token || '').trim();
    if (!token) {
      throw new Error('Os Correios não retornaram um token de acesso válido.');
    }

    const expiresAt = response.data?.expiraEm
      ? new Date(response.data.expiraEm)
      : decodeJwtExpiry(token);

    const entry = {
      token,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
      source: usesCard ? 'card' : 'contract'
    };

    tokenCache.set(key, entry);
    return entry;
  })();

  tokenPending.set(key, tokenRequest);
  try {
    return await tokenRequest;
  } finally {
    if (tokenPending.get(key) === tokenRequest) tokenPending.delete(key);
  }
}

async function authorizedRequest(config, requestFactory, authMode = 'auto') {
  let tokenEntry = await generateToken(config, false, authMode);

  try {
    return await requestFactory(tokenEntry.token);
  } catch (error) {
    if (error.response?.status !== 401 || config.staticToken) throw error;

    tokenCache.delete(cacheKey(config, authMode));
    tokenEntry = await generateToken(config, true, authMode);
    return requestFactory(tokenEntry.token);
  }
}

function responseMessage(error) {
  const data = error?.response?.data;
  if (typeof data === 'string') return data;

  const describe = (value) => {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return String(
      value?.message ||
      value?.mensagem ||
      value?.msg ||
      value?.detail ||
      value?.causa ||
      value?.txErro ||
      JSON.stringify(value)
    );
  };

  if (Array.isArray(data)) {
    const messages = data.map(describe).filter(Boolean);
    if (messages.length) return messages.join(' | ');
  }

  for (const key of ['msgs', 'messages', 'erros', 'errors']) {
    if (Array.isArray(data?.[key])) {
      const messages = data[key].map(describe).filter(Boolean);
      if (messages.length) return messages.join(' | ');
    }
  }

  return describe(data) || error?.message;
}

function shouldTryAlternativeEndpoint(error) {
  return [400, 404, 405].includes(Number(error?.response?.status || 0));
}

async function postWithEndpointFallback(config, paths, body, token) {
  let lastError;

  for (const path of paths) {
    try {
      const response = await axios.post(`${config.host}${path}`, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
      return { response, path };
    } catch (error) {
      lastError = error;
      if (!shouldTryAlternativeEndpoint(error)) throw error;
    }
  }

  throw lastError;
}

async function getWithEndpointFallback(config, paths, params, token) {
  let lastError;

  for (const path of paths) {
    try {
      const response = await axios.get(`${config.host}${path}`, {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        timeout: 30000
      });
      return { response, path };
    } catch (error) {
      lastError = error;
      if (!shouldTryAlternativeEndpoint(error)) throw error;
    }
  }

  throw lastError;
}

function buildPriceParameters(payload, products, config) {
  const parameters = [];

  products.forEach((product, productIndex) => {
    (payload.items || []).forEach((item, itemIndex) => {
      const requestId = `P${productIndex + 1}I${itemIndex + 1}`;
      parameters.push({
        requestId,
        product,
        item,
        quantity: Math.max(1, Number.parseInt(item.quantidade || 1, 10)),
        body: {
          coProduto: product.code,
          nuRequisicao: requestId,
          ...(config.contract ? { nuContrato: config.contract } : {}),
          ...(config.dr != null ? { nuDR: config.dr } : {}),
          cepOrigem: onlyDigits(payload.cepOrigem),
          psObjeto: String(kilogramsToGrams(item.peso)),
          tpObjeto: '2',
          comprimento: String(metersToCentimeters(item.comprimento)),
          largura: String(metersToCentimeters(item.largura)),
          altura: String(metersToCentimeters(item.altura)),
          cepDestino: onlyDigits(payload.cepDestino)
        }
      });
    });
  });

  return parameters;
}

function chunk(array, size) {
  const result = [];
  for (let index = 0; index < array.length; index += size) {
    result.push(array.slice(index, index + size));
  }
  return result;
}

async function requestPricesByGet(payload, config, parameters) {
  const responses = [];

  for (const entry of parameters) {
    const params = {
      nuRequisicao: entry.requestId,
      ...(config.contract ? { nuContrato: config.contract } : {}),
      ...(config.dr != null ? { nuDR: config.dr } : {}),
      cepOrigem: onlyDigits(payload.cepOrigem),
      psObjeto: String(kilogramsToGrams(entry.item.peso)),
      tpObjeto: '2',
      comprimento: String(metersToCentimeters(entry.item.comprimento)),
      largura: String(metersToCentimeters(entry.item.largura)),
      altura: String(metersToCentimeters(entry.item.altura)),
      cepDestino: onlyDigits(payload.cepDestino)
    };

    const result = await authorizedRequest(config, (token) =>
      getWithEndpointFallback(
        config,
        [
          `/preco/v3/v1/nacional/${entry.product.code}`,
          `/preco/v1/nacional/${entry.product.code}`
        ],
        params,
        token
      )
    );

    responses.push({
      row: result.response.data,
      fallbackRequestId: entry.requestId
    });
  }

  return responses;
}

async function requestPrices(payload, config, products) {
  const parameters = buildPriceParameters(payload, products, config);
  const responses = [];

  try {
    for (const [batchIndex, batch] of chunk(parameters, 100).entries()) {
      const result = await authorizedRequest(config, (token) =>
        postWithEndpointFallback(
          config,
          ['/preco/v3/v1/nacional', '/preco/v1/nacional'],
          {
            idLote: `${Date.now()}-${batchIndex + 1}`,
            parametrosProduto: batch.map((entry) => entry.body)
          },
          token
        )
      );

      const data = Array.isArray(result.response.data)
        ? result.response.data
        : result.response.data
          ? [result.response.data]
          : [];

      data.forEach((row, index) => {
        responses.push({
          row,
          fallbackRequestId: batch[index]?.requestId || null
        });
      });
    }
  } catch (error) {
    if (!shouldTryAlternativeEndpoint(error)) throw error;

    console.warn('Correios API — POST de preço rejeitado; tentando consulta individual GET.', {
      status: error.response?.status || null,
      message: responseMessage(error)
    });

    return {
      parameters,
      responses: await requestPricesByGet(payload, config, parameters)
    };
  }

  return { parameters, responses };
}

async function requestDeadlinesByGet(payload, config, products) {
  const rows = [];

  for (const [index, product] of products.entries()) {
    const result = await authorizedRequest(config, (token) =>
      getWithEndpointFallback(
        config,
        [
          `/prazo/v3/v1/nacional/${product.code}`,
          `/prazo/v1/nacional/${product.code}`
        ],
        {
          cepOrigem: onlyDigits(payload.cepOrigem),
          cepDestino: onlyDigits(payload.cepDestino),
          nuRequisicao: `S${index + 1}`
        },
        token
      )
    );

    rows.push({
      ...(result.response.data || {}),
      coProduto: result.response.data?.coProduto || product.code,
      nuRequisicao: result.response.data?.nuRequisicao || `S${index + 1}`
    });
  }

  return rows;
}

async function requestDeadlines(payload, config, products) {
  try {
    const result = await authorizedRequest(config, (token) =>
      postWithEndpointFallback(
        config,
        ['/prazo/v3/v1/nacional', '/prazo/v1/nacional'],
        {
          idLote: String(Date.now()),
          parametrosPrazo: products.map((product, index) => ({
            coProduto: product.code,
            nuRequisicao: `S${index + 1}`,
            cepOrigem: onlyDigits(payload.cepOrigem),
            cepDestino: onlyDigits(payload.cepDestino)
          }))
        },
        token
      )
    );

    return Array.isArray(result.response.data)
      ? result.response.data
      : result.response.data
        ? [result.response.data]
        : [];
  } catch (error) {
    if (!shouldTryAlternativeEndpoint(error)) throw error;

    console.warn('Correios API — POST de prazo rejeitado; tentando consulta individual GET.', {
      status: error.response?.status || null,
      message: responseMessage(error)
    });

    return requestDeadlinesByGet(payload, config, products);
  }
}

function normalizeQuoteResults(payload, config, products, priceData, deadlines) {
  const priceByRequest = new Map();
  priceData.responses.forEach(({ row, fallbackRequestId }) => {
    const requestId = String(row?.nuRequisicao || fallbackRequestId || '');
    if (requestId) priceByRequest.set(requestId, row);
  });

  const deadlineByProduct = new Map(
    deadlines.map((row) => [String(row?.coProduto || ''), row])
  );

  return products.map((product, productIndex) => {
    const entries = priceData.parameters.filter(
      (entry) => entry.product.code === product.code
    );

    let total = 0;
    const errors = [];
    const priceResponses = [];
    let detectedName = product.name;

    entries.forEach((entry) => {
      const row = priceByRequest.get(entry.requestId);
      priceResponses.push(row || null);

      const rowError = String(row?.txErro || '').trim();
      const finalPrice = parseDecimal(row?.pcFinal);
      detectedName = String(
        row?.nomeProduto || row?.noProduto || detectedName || product.code
      ).trim();

      if (!row) {
        errors.push(`Sem retorno de preço para o volume ${entry.requestId}.`);
        return;
      }
      if (rowError) {
        errors.push(rowError);
        return;
      }
      if (finalPrice == null) {
        errors.push(`Preço inválido retornado para o volume ${entry.requestId}.`);
        return;
      }

      total += finalPrice * entry.quantity;
    });

    const deadline = deadlineByProduct.get(product.code) || deadlines[productIndex] || null;
    const deadlineError = String(deadline?.txErro || '').trim();
    if (deadlineError) errors.push(deadlineError);

    const days = safeInteger(deadline?.prazoEntrega);
    const uniqueErrors = [...new Set(errors.filter(Boolean))];
    const success = uniqueErrors.length === 0 && entries.length > 0;

    return {
      id: `correios-${product.code}`,
      status: success ? 'success' : 'error',
      freightValue: success ? Number(total.toFixed(2)) : null,
      deadline: days != null ? `${days} dias úteis` : null,
      modality: detectedName || product.name || product.code,
      message: success ? null : uniqueErrors.join(' | ') || 'Não foi possível calcular este serviço.',
      rawResponse: {
        provider: 'Correios API',
        environment: config.environment,
        product: product.code,
        quantityVolumes: entries.reduce((sum, entry) => sum + entry.quantity, 0),
        prices: priceResponses,
        deadline
      }
    };
  });
}

async function quoteFreight(payload) {
  const config = credentialConfig(payload);

  if (!config.products.length) {
    return {
      status: 'error',
      results: [{
        id: 'correios-configuration',
        status: 'error',
        freightValue: null,
        deadline: null,
        modality: 'Correios',
        message: 'Configure os códigos de produtos dos Correios na credencial, por exemplo: 03220:SEDEX; 03298:PAC.',
        rawResponse: { configurationMissing: 'correiosProdutos' }
      }]
    };
  }

  console.log('Correios API — cotação iniciada:', {
    environment: config.environment,
    cepOrigem: onlyDigits(payload.cepOrigem),
    cepDestino: onlyDigits(payload.cepDestino),
    products: config.products.map((product) => product.code),
    items: (payload.items || []).map((item) => ({
      quantidade: Math.max(1, Number.parseInt(item.quantidade || 1, 10)),
      pesoGramas: kilogramsToGrams(item.peso),
      comprimentoCm: metersToCentimeters(item.comprimento),
      larguraCm: metersToCentimeters(item.largura),
      alturaCm: metersToCentimeters(item.altura)
    }))
  });

  try {
    const [priceData, deadlines] = await Promise.all([
      requestPrices(payload, config, config.products),
      requestDeadlines(payload, config, config.products)
    ]);

    const results = normalizeQuoteResults(
      payload,
      config,
      config.products,
      priceData,
      deadlines
    );

    console.log('Correios API — cotação concluída:', results.map((result) => ({
      modalidade: result.modality,
      status: result.status,
      valor: result.freightValue,
      prazo: result.deadline,
      mensagem: result.message
    })));

    return {
      status: results.some((result) => result.status === 'success')
        ? 'success'
        : 'error',
      results
    };
  } catch (error) {
    const message = responseMessage(error) || 'Erro ao consultar as APIs dos Correios.';

    console.error('Correios API — falha na cotação:', {
      status: error.response?.status || null,
      endpoint: error.config?.url || null,
      message,
      data: error.response?.data || null
    });

    return {
      status: 'error',
      results: config.products.map((product) => ({
        id: `correios-${product.code}`,
        status: 'error',
        freightValue: null,
        deadline: null,
        modality: product.name || product.code,
        message,
        rawResponse: {
          provider: 'Correios API',
          status: error.response?.status || null,
          endpoint: error.config?.url || null,
          data: error.response?.data || null
        }
      }))
    };
  }
}

function normalizeCepResponse(data, cep) {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.itens)
      ? data.itens
      : data && typeof data === 'object'
        ? [data]
        : [];

  const exact = rows.find((row) => onlyDigits(row?.cep) === cep) || rows[0];
  if (!exact) throw new Error('CEP não encontrado nos Correios.');

  return {
    cep: onlyDigits(exact.cep || cep),
    endereco: String(
      exact.logradouro ||
      [exact.tipoLogradouro, exact.nomeLogradouro].filter(Boolean).join(' ') ||
      ''
    ).trim(),
    bairro: String(exact.bairro || '').trim(),
    cidade: String(exact.localidade || exact.cidade || '').trim(),
    uf: String(exact.uf || '').trim().toUpperCase(),
    tipoCep: exact.tipoCEP ?? exact.tipoCep ?? null,
    provider: 'Correios API'
  };
}

async function lookupCep(payload, value) {
  const cep = onlyDigits(value);
  if (cep.length !== 8) throw new Error('Informe um CEP com 8 dígitos.');

  const config = credentialConfig(payload);
  const attempts = [
    { path: `/cep/v2/enderecos/${cep}` },
    { path: `/cp/v2/enderecos/${cep}` },
    { path: '/cep/v2/enderecos', params: { cep, page: 0, size: 10 } },
    { path: '/cp/v2/enderecos', params: { cep, page: 0, size: 10 } }
  ];
  let lastError;

  for (const attempt of attempts) {
    try {
      const response = await authorizedRequest(
        config,
        (token) => axios.get(`${config.host}${attempt.path}`, {
          ...(attempt.params ? { params: attempt.params } : {}),
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
          },
          timeout: 20000
        }),
        'contract'
      );

      return normalizeCepResponse(response.data, cep);
    } catch (error) {
      lastError = error;
      if (![404, 405].includes(Number(error.response?.status || 0))) break;
    }
  }

  throw new Error(responseMessage(lastError) || 'Não foi possível consultar o CEP nos Correios.');
}

async function testConnection(payload) {
  const config = credentialConfig(payload);
  const token = await generateToken(config, true, config.card ? 'card' : 'auto');

  return {
    success: true,
    status: 'online',
    message: `Autenticação dos Correios concluída em ${config.environment === 'PRODUCAO' ? 'produção' : 'homologação'}.`,
    details: {
      tokenSource: token.source,
      expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
      cardConfigured: Boolean(config.card),
      contractConfigured: Boolean(config.contract),
      dr: config.dr,
      products: config.products
    }
  };
}

module.exports = {
  quoteFreight,
  lookupCep,
  testConnection,
  credentialConfig,
  parseProducts
};
