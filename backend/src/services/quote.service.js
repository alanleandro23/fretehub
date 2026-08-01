const crypto = require('crypto');
const prisma = require('../db');
const { decrypt } = require('../utils/crypto');
const { evaluateCarrier } = require('./integration-registry');

const DRAFT_VERSION = 1;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeFreightType(value) {
  const normalized = String(value || 'CIF')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized === 'FOB') return 'FOB';
  if (normalized === 'TERCEIROS' || normalized === 'TERCEIRO') return 'TERCEIROS';
  return 'CIF';
}

function positiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function validCpf(value) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const calc = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function validCnpj(value) {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (baseLength) => {
    const weights = baseLength === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(cnpj[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

function validDocument(value) {
  const document = digits(value);
  return document.length === 11 ? validCpf(document) : validCnpj(document);
}

function requiredText(value, label) {
  if (!String(value || '').trim()) throw new Error(`Informe ${label}.`);
}

function validateUf(value) {
  return /^[A-Z]{2}$/.test(String(value || '').trim().toUpperCase());
}

function calcCubagem(item) {
  return (
    positiveNumber(item.comprimento) *
    positiveNumber(item.largura) *
    positiveNumber(item.altura) *
    positiveNumber(item.quantidade)
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error) {
  const responseData = error?.response?.data;
  const responseMessage = typeof responseData === 'string'
    ? responseData
    : responseData?.message || responseData?.error || responseData?.detail;

  return String(responseMessage || error?.message || 'Erro inesperado na integração.');
}

function isQuotaError(error) {
  const status = Number(error?.response?.status || error?.status || 0);
  const normalized = errorText(error).toLowerCase();

  return status === 429 || [
    'quota has been exceeded',
    'quota exceeded',
    'rate limit',
    'too many requests',
    'limite de requisições',
    'limite de requisicoes'
  ].some((term) => normalized.includes(term));
}

function friendlyIntegrationError(error) {
  if (isQuotaError(error)) {
    return 'Limite temporário de consultas atingido pela transportadora. O sistema tentou novamente, mas o serviço ainda está indisponível. Tente gerar a cotação novamente em alguns instantes.';
  }

  return errorText(error);
}

async function quoteWithRetry(operation, maxAttempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await operation();

      // Algumas integrações devolvem o limite como resultado de erro, sem lançar exceção.
      if (result?.status !== 'success' && isQuotaError({ message: result?.message })) {
        const quotaError = new Error(result.message || 'Quota has been exceeded');
        quotaError.rawResponse = result.rawResponse;
        throw quotaError;
      }

      return result;
    } catch (error) {
      lastError = error;

      if (!isQuotaError(error) || attempt === maxAttempts) {
        throw error;
      }

      await delay(700 * (2 ** (attempt - 1)));
    }
  }

  throw lastError;
}

function draftSecret() {
  const secret = process.env.QUOTE_DRAFT_SECRET || process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('Configure QUOTE_DRAFT_SECRET, JWT_SECRET ou ENCRYPTION_KEY para proteger as prévias de cotação.');
  }
  return secret;
}

function draftKey() {
  return crypto.createHash('sha256').update(draftSecret()).digest();
}

function encodeDraft(draft) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', draftKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(draft), 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, encrypted, authTag]
    .map((part) => part.toString('base64url'))
    .join('.');
}

function decodeDraft(token) {
  const [ivPart, encryptedPart, tagPart, ...extra] = String(token || '').split('.');
  if (!ivPart || !encryptedPart || !tagPart || extra.length) {
    throw new Error('Prévia de cotação inválida. Gere uma nova cotação.');
  }

  let draft;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      draftKey(),
      Buffer.from(ivPart, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, 'base64url')),
      decipher.final()
    ]);

    draft = JSON.parse(decrypted.toString('utf8'));
  } catch {
    throw new Error('A prévia de cotação foi alterada ou não pode ser lida. Gere uma nova cotação.');
  }

  if (draft.version !== DRAFT_VERSION || !draft.draftId || !draft.expiresAt) {
    throw new Error('Versão da prévia de cotação não suportada. Gere uma nova cotação.');
  }

  if (new Date(draft.expiresAt).getTime() < Date.now()) {
    throw new Error('Esta prévia expirou. Gere a cotação novamente antes de salvar.');
  }

  return draft;
}

async function getCarrierCredential(companyId, carrier) {
  const credential = await prisma.carrierCredential.findUnique({
    where: {
      companyId_carrierId_ambiente: {
        companyId,
        carrierId: carrier.id,
        ambiente: carrier.ambientePadrao
      }
    }
  });

  if (!credential || !credential.ativo) {
    return null;
  }

  return {
    id: credential.id,
    ativo: credential.ativo,
    ambiente: credential.ambiente,
    usuario: credential.usuario,
    senha: credential.senhaCriptografada
      ? decrypt(credential.senhaCriptografada)
      : null,
    token: credential.tokenCriptografado
      ? decrypt(credential.tokenCriptografado)
      : null,
    codigoCliente: credential.codigoCliente,
    contrato: credential.contrato,
    cnpjVinculado: credential.cnpjVinculado
  };
}

async function prepareItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Adicione pelo menos um produto ou volume à cotação.');
  }

  const productIds = [
    ...new Set(
      items
        .map((item) => Number(item.productId))
        .filter(Number.isInteger)
    )
  ];

  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds }, active: true }
      })
    : [];

  const productById = new Map(
    products.map((product) => [product.id, product])
  );

  return items.map((item, index) => {
    const productId = Number(item.productId);
    const product = Number.isInteger(productId)
      ? productById.get(productId)
      : null;

    if (item.productId && !product) {
      throw new Error(
        `O produto selecionado no item ${index + 1} não existe ou está inativo.`
      );
    }

    const quantidade = Math.max(
      1,
      Math.trunc(positiveNumber(item.quantidade, 1))
    );
    const comprimento = positiveNumber(
      item.comprimento,
      positiveNumber(product?.lengthMeters)
    );
    const largura = positiveNumber(
      item.largura,
      positiveNumber(product?.widthMeters)
    );
    const altura = positiveNumber(
      item.altura,
      positiveNumber(product?.heightMeters)
    );
    const peso = positiveNumber(
      item.peso,
      positiveNumber(product?.weightKg)
    );

    if (!comprimento || !largura || !altura) {
      throw new Error(
        `Informe comprimento, largura e altura do item ${index + 1} em metros.`
      );
    }

    const prepared = {
      productId: product?.id || null,
      descricao: item.descricao || product?.description || null,
      comprimento,
      largura,
      altura,
      peso,
      quantidade
    };

    prepared.cubagem = calcCubagem(prepared);
    return prepared;
  });
}

async function prepareCarrierContexts(companyId, carrierIds) {
  const rows = await prisma.carrier.findMany({
    where: { id: { in: carrierIds } }
  });

  const byId = new Map(rows.map((carrier) => [carrier.id, carrier]));
  const missingIds = carrierIds.filter((id) => !byId.has(id));

  if (missingIds.length) {
    throw new Error(
      `Uma ou mais transportadoras selecionadas não existem: ${missingIds.join(', ')}.`
    );
  }

  return Promise.all(
    carrierIds.map(async (carrierId) => {
      const carrier = byId.get(carrierId);
      const credential = await getCarrierCredential(companyId, carrier);
      const evaluation = evaluateCarrier(carrier, credential);

      return {
        carrier,
        credential,
        evaluation
      };
    })
  );
}

async function prepareQuoteContext(user, body) {
  const companyId = user.role === 'ADMIN'
    ? Number(body.companyId)
    : Number(user.companyId);

  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error('O usuário precisa estar vinculado a uma empresa remetente.');
  }

  const company = await prisma.company.findFirst({
    where: { id: companyId, ativo: true }
  });

  if (!company) {
    throw new Error('Empresa remetente não encontrada ou inativa.');
  }

  const carrierIds = [
    ...new Set(
      (body.carrierIds || [])
        .map(Number)
        .filter(Number.isInteger)
    )
  ];

  if (!carrierIds.length) {
    throw new Error('Selecione pelo menos uma transportadora.');
  }

  const carrierContexts = await prepareCarrierContexts(companyId, carrierIds);
  const availableContexts = carrierContexts.filter(
    (context) => context.evaluation.available
  );

  if (!availableContexts.length) {
    const details = carrierContexts
      .map(({ carrier, evaluation }) => `${carrier.nome}: ${evaluation.reason}`)
      .join(' | ');

    throw new Error(
      `Nenhuma transportadora selecionada está pronta para cotar. ${details}`
    );
  }

  const items = await prepareItems(body.items);
  const quantidadeVolumes = items.reduce(
    (total, item) => total + item.quantidade,
    0
  );
  const calculatedWeight = items.reduce(
    (total, item) => total + item.peso * item.quantidade,
    0
  );
  const pesoTotal = calculatedWeight || positiveNumber(body.pesoTotal);
  const tipoFrete = normalizeFreightType(body.tipoFrete);

  const documentoRemetente = digits(company.cnpj);
  const documentoDestinatario = digits(body.cnpjDestinatario);
  const cepOrigem = digits(company.cep);
  const cepDestino = digits(body.cepDestino);

  if (!validCnpj(documentoRemetente)) {
    throw new Error('O CNPJ da empresa remetente está incompleto ou inválido. Corrija o cadastro da empresa.');
  }
  if (cepOrigem.length !== 8) {
    throw new Error('O CEP da empresa remetente está incompleto. Corrija o cadastro da empresa.');
  }
  if (!validDocument(documentoDestinatario)) {
    throw new Error('Informe um CPF ou CNPJ válido para o destinatário.');
  }
  requiredText(body.razaoSocialDestinatario, 'a razão social ou o nome do destinatário');
  if (cepDestino.length !== 8) throw new Error('Informe um CEP de destino com 8 dígitos.');
  requiredText(body.enderecoDestino, 'o endereço do destinatário');
  requiredText(body.cidadeDestino, 'a cidade do destinatário');
  if (!validateUf(body.ufDestino)) throw new Error('Informe uma UF válida para o destinatário.');
  requiredText(body.modal || 'Rodoviário', 'o modal da cotação');

  if (positiveNumber(body.valorMercadoria) <= 0) {
    throw new Error('Informe um valor de mercadoria maior que zero.');
  }
  if (pesoTotal <= 0) {
    throw new Error('Informe o peso dos produtos/volumes.');
  }
  if (quantidadeVolumes <= 0) {
    throw new Error('Informe ao menos um volume na cotação.');
  }

  if (tipoFrete === 'TERCEIROS') {
    if (!validDocument(body.cnpjTerceiro || body.documentoPagador)) {
      throw new Error('Informe um CPF ou CNPJ válido para o terceiro pagador.');
    }
    requiredText(body.razaoSocialTerceiro, 'a razão social ou o nome do terceiro pagador');
  }
  const documentoPagador =
    tipoFrete === 'FOB'
      ? documentoDestinatario
      : tipoFrete === 'TERCEIROS'
        ? String(body.cnpjTerceiro || body.documentoPagador || '').replace(/\D/g, '')
        : documentoRemetente;

  const quoteData = {
    companyId,
    userId: user.id,
    cnpjDestinatario: documentoDestinatario,
    razaoSocialDestinatario: body.razaoSocialDestinatario || null,
    cepDestino,
    enderecoDestino: body.enderecoDestino || null,
    cidadeDestino: body.cidadeDestino || null,
    ufDestino: body.ufDestino || null,
    cnpjTerceiro:
      tipoFrete === 'TERCEIROS'
        ? String(
            body.cnpjTerceiro ||
            body.documentoTerceiro ||
            body.documentoPagador ||
            ''
          ).replace(/\D/g, '') || null
        : null,
    razaoSocialTerceiro:
      tipoFrete === 'TERCEIROS'
        ? body.razaoSocialTerceiro || null
        : null,
    valorMercadoria: positiveNumber(body.valorMercadoria),
    pesoTotal,
    quantidadeVolumes,
    tipoFrete,
    modal: body.modal || 'Rodoviário',
    items
  };

  const integrationPayload = {
    ...body,
    companyId,
    company,
    tipoFrete,
    cnpjTerceiro: tipoFrete === 'TERCEIROS' ? documentoPagador : null,
    documentoPagador,
    documentoRemetente,
    documentoDestinatario,
    cepOrigem,
    pesoTotal,
    quantidadeVolumes,
    items,
    valorMercadoria: positiveNumber(body.valorMercadoria)
  };

  return {
    company,
    carrierContexts,
    quoteData,
    integrationPayload
  };
}

async function runCarrierQuotes(carrierContexts, integrationPayload) {
  return Promise.all(
    carrierContexts.map(async ({ carrier, credential, evaluation }) => {
      let result;

      if (!evaluation.available) {
        result = {
          status: 'error',
          freightValue: null,
          deadline: null,
          modality: null,
          message: `Não consultada: ${evaluation.reason}`,
          rawResponse: {
            skipped: true,
            reason: evaluation.reason
          }
        };
      } else {
        try {
          const carrierPayload = {
            ...integrationPayload,
            carrier: {
              id: carrier.id,
              nome: carrier.nome,
              tipoIntegracao: carrier.tipoIntegracao,
              ambiente: carrier.ambientePadrao,
              apiUrl: carrier.apiUrl,
              portalUrl: carrier.portalUrl
            },
            credential,
            credentialSource: evaluation.credentialSource
          };

          result = await quoteWithRetry(
            () => evaluation.definition.service.quoteFreight(carrierPayload)
          );
        } catch (error) {
          result = {
            status: 'error',
            freightValue: null,
            deadline: null,
            modality: null,
            message: friendlyIntegrationError(error),
            rawResponse: {
              error: errorText(error),
              quotaExceeded: isQuotaError(error)
            }
          };
        }
      }

      return {
        carrierId: carrier.id,
        carrier: {
          id: carrier.id,
          nome: carrier.nome,
          logoUrl: carrier.logoUrl || null
        },
        status: result.status === 'success' ? 'success' : 'error',
        valorFrete: result.freightValue ?? null,
        prazo: result.deadline ?? null,
        modalidade: result.modality ?? null,
        mensagem: result.message ?? null,
        rawResponse: result.rawResponse ?? null
      };
    })
  );
}

function publicPreview(draft, company, user) {
  return {
    id: null,
    saved: false,
    draftId: draft.draftId,
    draftToken: encodeDraft(draft),
    createdAt: draft.previewedAt,
    company,
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    },
    ...draft.quote,
    results: draft.results.map((result) => ({
      ...result,
      rawResponse: undefined
    }))
  };
}

async function generateQuotePreview(user, body) {
  const { company, carrierContexts, quoteData, integrationPayload } =
    await prepareQuoteContext(user, body);
  const results = await runCarrierQuotes(carrierContexts, integrationPayload);
  const previewedAt = new Date();

  const draft = {
    version: DRAFT_VERSION,
    draftId: crypto.randomUUID(),
    previewedAt: previewedAt.toISOString(),
    expiresAt: new Date(previewedAt.getTime() + DRAFT_TTL_MS).toISOString(),
    owner: {
      userId: user.id,
      companyId: quoteData.companyId
    },
    quote: quoteData,
    results
  };

  return publicPreview(draft, company, user);
}

function assertDraftAccess(draft, user) {
  if (Number(draft.owner?.userId) !== Number(user.id)) {
    throw new Error('Esta prévia pertence a outro usuário. Gere uma nova cotação.');
  }

  if (
    user.role !== 'ADMIN' &&
    Number(draft.owner?.companyId) !== Number(user.companyId)
  ) {
    throw new Error('Você não tem acesso à empresa desta cotação.');
  }
}

const quoteInclude = {
  company: true,
  user: { select: { id: true, name: true, email: true } },
  items: { include: { product: true } },
  results: { include: { carrier: true } }
};

async function saveQuotePreview(user, token) {
  const draft = decodeDraft(token);
  assertDraftAccess(draft, user);

  const existing = await prisma.quote.findUnique({
    where: { draftId: draft.draftId },
    include: quoteInclude
  });

  if (existing) {
    return { ...existing, saved: true };
  }

  const company = await prisma.company.findFirst({
    where: { id: Number(draft.quote.companyId), ativo: true },
    select: { id: true }
  });

  if (!company) {
    throw new Error('A empresa da cotação não existe mais ou está inativa.');
  }

  const carrierIds = [...new Set(draft.results.map((result) => Number(result.carrierId)))];
  const carriers = await prisma.carrier.findMany({
    where: { id: { in: carrierIds } },
    select: { id: true }
  });

  if (carriers.length !== carrierIds.length) {
    throw new Error('Uma das transportadoras da prévia não está mais disponível. Gere a cotação novamente.');
  }

  const hasSuccess = draft.results.some((result) => result.status === 'success');

  let quote;

  try {
    quote = await prisma.quote.create({
    data: {
      draftId: draft.draftId,
      companyId: Number(draft.quote.companyId),
      userId: user.id,
      cnpjDestinatario: draft.quote.cnpjDestinatario,
      razaoSocialDestinatario: draft.quote.razaoSocialDestinatario,
      cepDestino: draft.quote.cepDestino,
      enderecoDestino: draft.quote.enderecoDestino,
      cidadeDestino: draft.quote.cidadeDestino,
      ufDestino: draft.quote.ufDestino,
      cnpjTerceiro: draft.quote.cnpjTerceiro,
      razaoSocialTerceiro: draft.quote.razaoSocialTerceiro,
      valorMercadoria: positiveNumber(draft.quote.valorMercadoria),
      pesoTotal: positiveNumber(draft.quote.pesoTotal),
      quantidadeVolumes: Math.max(1, Math.trunc(positiveNumber(draft.quote.quantidadeVolumes, 1))),
      tipoFrete: normalizeFreightType(draft.quote.tipoFrete),
      modal: draft.quote.modal || 'Rodoviário',
      status: hasSuccess ? 'COMPLETED' : 'ERROR',
      items: {
        create: draft.quote.items.map((item) => ({
          productId: item.productId || null,
          descricao: item.descricao || null,
          comprimento: positiveNumber(item.comprimento),
          largura: positiveNumber(item.largura),
          altura: positiveNumber(item.altura),
          peso: positiveNumber(item.peso),
          quantidade: Math.max(1, Math.trunc(positiveNumber(item.quantidade, 1))),
          cubagem: positiveNumber(item.cubagem)
        }))
      },
      results: {
        create: draft.results.map((result) => ({
          carrierId: Number(result.carrierId),
          status: result.status === 'success' ? 'success' : 'error',
          valorFrete: result.valorFrete == null ? null : positiveNumber(result.valorFrete),
          prazo: result.prazo || null,
          modalidade: result.modalidade || null,
          mensagem: result.mensagem || null,
          rawResponse: result.rawResponse == null ? undefined : result.rawResponse
        }))
      }
    },
    include: quoteInclude
    });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;

    quote = await prisma.quote.findUnique({
      where: { draftId: draft.draftId },
      include: quoteInclude
    });

    if (!quote) throw error;
  }

  return { ...quote, saved: true };
}

module.exports = {
  generateQuotePreview,
  saveQuotePreview,
  normalizeFreightType,
  friendlyIntegrationError,
  isQuotaError
};
