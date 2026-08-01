const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (length) => {
    let sum = 0;
    let weight = length - 7;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cnpj[index]) * weight;
      weight -= 1;
      if (weight === 1) weight = 9;
    }
    const result = 11 - (sum % 11);
    return result >= 10 ? 0 : result;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

async function fetchJson(url, timeoutMs = 10000) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'FreteHub/1.0' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const error = new Error(`Serviço de consulta respondeu HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function lookupCep(cep) {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) return null;
  const data = await fetchJson(`https://viacep.com.br/ws/${digits}/json/`, 8000);
  return data?.erro ? null : data;
}

async function lookupCompanyByCnpj(value) {
  const cnpj = onlyDigits(value);
  if (!isValidCnpj(cnpj)) throw new Error('Informe um CNPJ válido com 14 dígitos.');

  const cached = cache.get(cnpj);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.value;

  const data = await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  const cepDigits = onlyDigits(data.cep);
  let cepData = null;
  if (cepDigits.length === 8 && (!data.logradouro || !data.bairro || !data.municipio || !data.uf)) {
    cepData = await lookupCep(cepDigits).catch(() => null);
  }

  const result = {
    provider: 'BrasilAPI',
    cnpj,
    razaoSocial: data.razao_social || '',
    nomeFantasia: data.nome_fantasia || '',
    inscricaoEstadual: '',
    situacaoCadastral: data.descricao_situacao_cadastral || '',
    cep: cepDigits,
    endereco: [data.descricao_tipo_de_logradouro, data.logradouro].filter(Boolean).join(' ').trim() || cepData?.logradouro || '',
    numero: data.numero || '',
    complemento: data.complemento || cepData?.complemento || '',
    bairro: data.bairro || cepData?.bairro || '',
    cidade: data.municipio || cepData?.localidade || '',
    uf: data.uf || cepData?.uf || '',
    telefone: data.ddd_telefone_1 || data.ddd_telefone_2 || '',
    email: data.email || '',
    atividadePrincipal: data.cnae_fiscal_descricao || '',
    consultedAt: new Date().toISOString()
  };

  cache.set(cnpj, { createdAt: Date.now(), value: result });
  return result;
}

module.exports = { lookupCompanyByCnpj, lookupCep, isValidCnpj };
