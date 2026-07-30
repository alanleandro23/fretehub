const prisma = require('../db');
const { decrypt } = require('../utils/crypto');

const { getDefinition, evaluateTrackingCarrier } = require('./integration-registry');
const { sendDeliveryEmail } = require('./email.service');
const { TRACKING_INTERVAL_MINUTES } = require('./config.service');

const activeChecks = new Set();

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(text)) {
    const [datePart, timePart = '12:00:00'] = text.split(' ');
    const [day, month, year] = datePart.split('/');
    const parsed = new Date(`${year}-${month}-${day}T${timePart.length === 5 ? `${timePart}:00` : timePart}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsedDate = new Date(`${text}T12:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateBR(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('pt-BR');
}

function onlyNumbers(value) {
  return String(value || '').replace(/\D/g, '');
}

function scalarText(value) {
  if (value === undefined || value === null) return null;
  if (!['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return null;
  const text = String(value).trim();
  return text || null;
}

function locationParts(value) {
  if (!value) return { cidade: null, uf: null };

  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (!text) return { cidade: null, uf: null };

    const match = text.match(/^(.+?)[\s\/-]+([A-Za-z]{2})$/);
    return match
      ? { cidade: match[1].trim(), uf: match[2].toUpperCase() }
      : { cidade: text, uf: null };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return { cidade: null, uf: null };
  }

  return {
    cidade:
      scalarText(value.cidade) ||
      scalarText(value.municipio) ||
      scalarText(value.localidade) ||
      scalarText(value.nome),
    uf:
      scalarText(value.uf) ||
      scalarText(value.estado) ||
      scalarText(value.siglaEstado) ||
      scalarText(value.sigla)
  };
}

function toJsonSafe(value, seen = new WeakSet()) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map((item) => toJsonSafe(item, seen));

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = toJsonSafe(item, seen);
    }

    seen.delete(value);
    return output;
  }

  return String(value);
}

function isDeliveredStatus(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  return normalized.includes('ENTREG');
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes || TRACKING_INTERVAL_MINUTES) * 60 * 1000);
}

function nextAttemptDate(tracking, failed = false) {
  const baseMinutes = TRACKING_INTERVAL_MINUTES;
  if (!failed) return addMinutes(new Date(), baseMinutes);

  const multiplier = Math.min(2 ** Number(tracking.consecutiveErrors || 0), 16);
  return addMinutes(new Date(), baseMinutes * multiplier);
}

function accessWhere() {
  // Trackings são compartilhados entre todos os usuários autenticados.
  // As permissões de alteração e exclusão continuam protegidas nas rotas administrativas.
  return {};
}

function providerForCarrier(carrier) {
  return getDefinition(carrier)?.service || null;
}

async function listAvailableCarriers(query = {}, user = null) {
  const companyId = user?.role === 'ADMIN'
    ? Number(query.companyId || 0)
    : Number(user?.companyId || 0);

  if (!companyId) return [];

  const company = await prisma.company.findFirst({
    where: { id: companyId, ativo: true },
    select: { id: true }
  });

  if (!company) return [];

  const carriers = await prisma.carrier.findMany({
    where: { ativo: true },
    orderBy: { nome: 'asc' }
  });

  const credentials = await prisma.carrierCredential.findMany({
    where: {
      companyId,
      ativo: true,
      carrierId: { in: carriers.map((carrier) => carrier.id) }
    }
  });

  const credentialByKey = new Map(
    credentials.map((credential) => [
      `${credential.carrierId}:${credential.ambiente}`,
      credential
    ])
  );

  const evaluatedCarriers = await Promise.all(
    carriers.map(async (carrier) => {
      const credential = credentialByKey.get(
        `${carrier.id}:${carrier.ambientePadrao}`
      ) || null;
      const availability = await evaluateTrackingCarrier(carrier, credential);

      return {
        id: carrier.id,
        nome: carrier.nome,
        logoUrl: carrier.logoUrl,
        tipoIntegracao: carrier.tipoIntegracao,
        automaticTracking: availability.available,
        unavailableReason: availability.reason,
        credentialSource: availability.credentialSource
      };
    })
  );

  return evaluatedCarriers.filter((carrier) => carrier.automaticTracking);
}

async function getTrackingCredential(tracking, carrier) {
  if (!tracking.companyId || !tracking.carrierId) return {};

  const credential = await prisma.carrierCredential.findUnique({
    where: {
      companyId_carrierId_ambiente: {
        companyId: tracking.companyId,
        carrierId: tracking.carrierId,
        ambiente: carrier.ambientePadrao
      }
    }
  });

  if (!credential || !credential.ativo) return {};

  return {
    id: credential.id,
    ativo: credential.ativo,
    ambiente: credential.ambiente,
    usuario: credential.usuario,
    senha: credential.senhaCriptografada ? decrypt(credential.senhaCriptografada) : null,
    token: credential.tokenCriptografado ? decrypt(credential.tokenCriptografado) : null,
    codigoCliente: credential.codigoCliente,
    contrato: credential.contrato,
    cnpjVinculado: credential.cnpjVinculado
  };
}

const trackingInclude = {
  carrier: { select: { id: true, nome: true, ambientePadrao: true, ativo: true } },
  company: { select: { id: true, razaoSocial: true, nomeFantasia: true, email: true } },
  user: { select: { id: true, name: true } },
  events: { orderBy: [{ dataEvento: 'asc' }, { createdAt: 'asc' }] }
};

async function listTrackings(query = {}, user = null) {
  const where = { ...accessWhere(user) };

  if (query.companyId && user?.role === 'ADMIN') where.companyId = Number(query.companyId);
  if (query.carrierId) where.carrierId = Number(query.carrierId);
  if (query.notaFiscal) {
    where.numeroNota = { contains: String(query.notaFiscal), mode: 'insensitive' };
  }
  if (query.pedido) {
    where.numeroPedido = { contains: String(query.pedido), mode: 'insensitive' };
  }
  if (query.conhecimento) {
    where.conhecimento = { contains: String(query.conhecimento), mode: 'insensitive' };
  }
  if (query.documento) {
    where.documento = { contains: onlyNumbers(query.documento), mode: 'insensitive' };
  }
  if (query.status) {
    where.status = { contains: String(query.status), mode: 'insensitive' };
  }

  const rows = await prisma.shipmentTracking.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: trackingInclude,
    take: Math.min(Number(query.limit) || 300, 1000)
  });

  return rows.map(normalizeTracking);
}

async function findCarrier(data, companyId) {
  const carrierId = Number(data.carrierId || 0);
  const carrierName = String(data.transportadora || data.carrier || '').trim();

  const carrier = await prisma.carrier.findFirst({
    where: {
      ativo: true,
      ...(carrierId
        ? { id: carrierId }
        : { nome: { equals: carrierName, mode: 'insensitive' } })
    }
  });

  if (!carrier) throw new Error('Transportadora não encontrada ou inativa.');

  const credential = await prisma.carrierCredential.findUnique({
    where: {
      companyId_carrierId_ambiente: {
        companyId,
        carrierId: carrier.id,
        ambiente: carrier.ambientePadrao
      }
    }
  });

  const availability = await evaluateTrackingCarrier(carrier, credential);
  if (!availability.available) {
    throw new Error(`${carrier.nome}: ${availability.reason}`);
  }

  return carrier;
}

async function resolveCompanyId(data, user) {
  if (!user) throw new Error('Usuário não identificado.');

  const companyId = user.role === 'ADMIN'
    ? Number(data.companyId || user.companyId || 0)
    : Number(user.companyId || 0);

  if (!companyId) throw new Error('Selecione uma empresa para o tracking.');

  const company = await prisma.company.findFirst({
    where: { id: companyId, ativo: true },
    select: { id: true }
  });

  if (!company) throw new Error('Empresa do tracking não encontrada ou inativa.');
  return company.id;
}

async function createTracking(data, user) {
  const companyId = await resolveCompanyId(data, user);
  const carrier = await findCarrier(data, companyId);

  const identifiers = [data.notaFiscal, data.numeroNota, data.pedido, data.numeroPedido, data.conhecimento]
    .filter((value) => String(value || '').trim());

  if (!identifiers.length) {
    throw new Error('Informe pelo menos Nota Fiscal, Pedido ou Conhecimento/CT-e.');
  }

  if (getDefinition(carrier)?.key === 'jamef' && !data.notaFiscal && !data.numeroNota && !data.conhecimento) {
    throw new Error('Para a Jamef, informe a Nota Fiscal ou o Conhecimento/CT-e.');
  }

  const checkIntervalMinutes = TRACKING_INTERVAL_MINUTES;

  const now = new Date();
  const tracking = await prisma.shipmentTracking.create({
    data: {
      userId: user.id,
      companyId,
      carrierId: carrier.id,
      numeroNota: String(data.numeroNota || data.notaFiscal || '').trim() || null,
      numeroPedido: String(data.numeroPedido || data.pedido || '').trim() || null,
      conhecimento: String(data.conhecimento || '').trim() || null,
      documento: onlyNumbers(data.documento) || null,
      status: 'Criado',
      monitoringActive: true,
      checkIntervalMinutes,
      nextCheckAt: addMinutes(now, TRACKING_INTERVAL_MINUTES),
      rawResponse: { transportadora: carrier.nome },
      events: {
        create: [{
          tipo: 'CRIADO',
          descricao: 'Carga criada e incluída manualmente no monitoramento.',
          dataEvento: now,
          rawResponse: { automatic: false, nextStep: 'automatic_tracking' }
        }]
      }
    }
  });

  return getTrackingById(tracking.id, user);
}

async function addTrackingEvent(trackingId, data, user) {
  const tracking = await prisma.shipmentTracking.findFirst({
    where: { id: Number(trackingId), ...accessWhere(user) }
  });
  if (!tracking) throw new Error('Tracking não encontrado.');

  const lastStatus = data.status || data.tipo || data.tipoEvento || 'OCORRENCIA';
  const delivered = isDeliveredStatus(lastStatus) || isDeliveredStatus(data.descricao);
  const eventDate = parseDate(data.dataEvento) || new Date();

  const event = await prisma.shipmentEvent.create({
    data: {
      trackingId: tracking.id,
      tipo: data.tipo || data.tipoEvento || 'OCORRENCIA',
      descricao: data.descricao || data.ultimaOcorrencia || 'Ocorrência logística',
      dataEvento: eventDate,
      cidade: data.cidade || data.cidadeEvento || null,
      uf: data.uf || data.ufEvento || null,
      rawResponse: data
    }
  });

  await prisma.shipmentTracking.update({
    where: { id: tracking.id },
    data: {
      status: lastStatus,
      dataEntrega: delivered ? eventDate : undefined,
      monitoringActive: delivered ? false : undefined,
      notificationSentAt: delivered ? null : undefined,
      emailNotificationNextAttemptAt: delivered ? eventDate : undefined,
      emailNotificationError: delivered ? null : undefined
    }
  });

  return event;
}


async function updateTracking(id, data, user) {
  const trackingId = Number(id);
  if (!trackingId) throw new Error('Tracking inválido.');

  const current = await prisma.shipmentTracking.findUnique({
    where: { id: trackingId }
  });
  if (!current) throw new Error('Tracking não encontrado.');

  const companyId = data.companyId != null
    ? await resolveCompanyId(data, user)
    : current.companyId;

  let carrierId = current.carrierId;
  let carrierName = null;
  if (data.carrierId != null || data.transportadora || data.carrier) {
    const carrier = await findCarrier(data, companyId);
    carrierId = carrier.id;
    carrierName = carrier.nome;
  }

  const requestedStatus = data.status !== undefined
    ? String(data.status || '').trim() || null
    : current.status;
  const deliveredByStatus = isDeliveredStatus(requestedStatus);
  const explicitDeliveryDate = data.dataEntrega !== undefined
    ? parseDate(data.dataEntrega)
    : undefined;
  const deliveryDate = explicitDeliveryDate !== undefined
    ? explicitDeliveryDate
    : deliveredByStatus && !current.dataEntrega
      ? new Date()
      : undefined;
  const monitoringActive = deliveryDate || deliveredByStatus
    ? false
    : data.monitoringActive == null
      ? current.monitoringActive
      : Boolean(data.monitoringActive);

  const updateData = {
    companyId,
    carrierId,
    numeroNota: data.numeroNota !== undefined || data.notaFiscal !== undefined
      ? String(data.numeroNota || data.notaFiscal || '').trim() || null
      : undefined,
    numeroPedido: data.numeroPedido !== undefined || data.pedido !== undefined
      ? String(data.numeroPedido || data.pedido || '').trim() || null
      : undefined,
    conhecimento: data.conhecimento !== undefined
      ? String(data.conhecimento || '').trim() || null
      : undefined,
    documento: data.documento !== undefined
      ? onlyNumbers(data.documento) || null
      : undefined,
    status: data.status !== undefined ? requestedStatus : undefined,
    previsaoEntrega: data.previsaoEntrega !== undefined
      ? parseDate(data.previsaoEntrega)
      : undefined,
    dataEntrega: deliveryDate,
    cidadeDestino: data.cidadeDestino !== undefined
      ? String(data.cidadeDestino || '').trim() || null
      : undefined,
    ufDestino: data.ufDestino !== undefined
      ? String(data.ufDestino || '').trim().toUpperCase() || null
      : undefined,
    monitoringActive,
    checkIntervalMinutes: TRACKING_INTERVAL_MINUTES,
    nextCheckAt: monitoringActive
      ? addMinutes(new Date(), TRACKING_INTERVAL_MINUTES)
      : current.nextCheckAt,
    lastCheckError: data.clearLastCheckError ? null : undefined,
    notificationSentAt: deliveryDate || deliveredByStatus ? null : undefined,
    emailNotificationNextAttemptAt: deliveryDate || deliveredByStatus ? new Date() : undefined,
    emailNotificationError: deliveryDate || deliveredByStatus ? null : undefined,
    rawResponse: carrierName
      ? { ...(current.rawResponse || {}), transportadora: carrierName }
      : undefined
  };

  Object.keys(updateData).forEach((key) => {
    if (updateData[key] === undefined) delete updateData[key];
  });

  await prisma.$transaction([
    prisma.shipmentTracking.update({
      where: { id: trackingId },
      data: updateData
    }),
    prisma.shipmentEvent.create({
      data: {
        trackingId,
        tipo: 'ALTERACAO_ADMIN',
        descricao: 'Dados do monitoramento alterados pelo administrador.',
        dataEvento: new Date(),
        rawResponse: {
          automatic: false,
          updatedBy: user?.id || null
        }
      }
    })
  ]);

  return getTrackingById(trackingId, user);
}

async function deleteTracking(id) {
  const trackingId = Number(id);
  if (!trackingId) throw new Error('Tracking inválido.');

  const current = await prisma.shipmentTracking.findUnique({
    where: { id: trackingId },
    select: { id: true }
  });
  if (!current) throw new Error('Tracking não encontrado.');

  await prisma.$transaction([
    prisma.shipmentEvent.deleteMany({ where: { trackingId } }),
    prisma.shipmentTracking.delete({ where: { id: trackingId } })
  ]);

  return { success: true };
}


function normalizeEventText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isExceptionalTrackingText(value) {
  const text = normalizeEventText(value);

  const exceptionTerms = [
    'NAO ENTREG',
    'TENTATIVA DE ENTREGA',
    'DESTINATARIO AUSENTE',
    'ENDERECO NAO LOCALIZADO',
    'ENDERECO INSUFICIENTE',
    'RECUS',
    'DEVOLU',
    'AVARIA',
    'EXTRAVIO',
    'SINISTRO',
    'ROUBO',
    'FURTO',
    'CANCEL',
    'BLOQUE',
    'RETEN',
    'PENDENC',
    'ATRAS',
    'FALHA',
    'PROBLEMA',
    'DIVERGEN',
    'IMPOSSIBILIDADE',
    'AGUARDANDO REGULARIZACAO'
  ];

  return exceptionTerms.some((term) => text.includes(normalizeEventText(term)));
}

function classifyTrackingEvent(event = {}) {
  const description = String(
    event.descricao ||
    event.ultimaOcorrencia ||
    event.status ||
    event.tipo ||
    'Ocorrência logística'
  ).trim();

  const combined = `${event.tipo || ''} ${description}`;

  if (isDeliveredStatus(combined) || event.dataEntrega) {
    return {
      key: 'ENTREGUE',
      tipo: 'ENTREGUE',
      status: 'Entregue',
      descricao: description || 'Entrega realizada'
    };
  }

  if (isExceptionalTrackingText(combined)) {
    return {
      key: `DIVERGENCIA:${normalizeEventText(description)}`,
      tipo: 'DIVERGÊNCIA',
      status: description || 'Divergência na entrega',
      descricao: description || 'Divergência na entrega'
    };
  }

  return {
    key: 'EM_TRANSITO',
    tipo: 'EM TRÂNSITO',
    status: 'Em trânsito',
    descricao: description
  };
}

function technicalEvent(tipo) {
  return [
    'NOTIFICACAO_EMAIL_ENVIADA',
    'ALTERACAO_ADMIN'
  ].includes(String(tipo || '').toUpperCase());
}

async function normalizeCreatedEvent(trackingId) {
  const legacy = await prisma.shipmentEvent.findFirst({
    where: {
      trackingId,
      tipo: { in: ['CADASTRO_MANUAL', 'CRIADO'] }
    },
    orderBy: { createdAt: 'asc' }
  });

  if (!legacy) {
    return prisma.shipmentEvent.create({
      data: {
        trackingId,
        tipo: 'CRIADO',
        descricao: 'Carga criada e incluída manualmente no monitoramento.',
        dataEvento: new Date(),
        rawResponse: { automatic: false, repaired: true }
      }
    });
  }

  if (
    legacy.tipo !== 'CRIADO' ||
    legacy.descricao !== 'Carga criada e incluída manualmente no monitoramento.'
  ) {
    return prisma.shipmentEvent.update({
      where: { id: legacy.id },
      data: {
        tipo: 'CRIADO',
        descricao: 'Carga criada e incluída manualmente no monitoramento.'
      }
    });
  }

  return legacy;
}


function eventSourceDetails(event = {}) {
  const raw = event.rawResponse || {};
  const providerEvent = raw.providerEvent || raw.rawResponse || {};
  const originLocation = locationParts(
    event.localOrigem || raw.localOrigem || providerEvent.localOrigem
  );
  const destinationLocation = locationParts(
    event.localDestino || raw.localDestino || providerEvent.localDestino
  );

  return {
    sourceKey:
      scalarText(event.sourceKey) ||
      scalarText(raw.sourceKey) ||
      scalarText(providerEvent.sourceKey) ||
      null,
    estadoOrigem:
      scalarText(event.estadoOrigem) ||
      scalarText(raw.estadoOrigem) ||
      scalarText(providerEvent.estadoOrigem) ||
      scalarText(providerEvent.ufOrigem) ||
      originLocation.uf ||
      null,
    municipioOrigem:
      scalarText(event.municipioOrigem) ||
      scalarText(raw.municipioOrigem) ||
      scalarText(providerEvent.municipioOrigem) ||
      scalarText(providerEvent.cidadeOrigem) ||
      originLocation.cidade ||
      null,
    estadoDestino:
      scalarText(event.estadoDestino) ||
      scalarText(raw.estadoDestino) ||
      scalarText(providerEvent.estadoDestino) ||
      scalarText(providerEvent.ufDestino) ||
      destinationLocation.uf ||
      null,
    municipioDestino:
      scalarText(event.municipioDestino) ||
      scalarText(raw.municipioDestino) ||
      scalarText(providerEvent.municipioDestino) ||
      scalarText(providerEvent.cidadeDestino) ||
      destinationLocation.cidade ||
      null
  };
}

function occurrenceKey(event = {}) {
  const details = eventSourceDetails(event);
  if (details.sourceKey) return String(details.sourceKey);

  const sourceDate = parseDate(event.dataEvento || event.dataEntrega);
  return [
    normalizeEventText(event.descricao || event.tipo || event.status),
    sourceDate ? sourceDate.toISOString() : String(event.dataEvento || ''),
    normalizeEventText(details.estadoOrigem),
    normalizeEventText(details.municipioOrigem),
    normalizeEventText(details.estadoDestino),
    normalizeEventText(details.municipioDestino)
  ].join('|');
}

function isInvalidCarrierOccurrence(event = {}) {
  const description = String(event.descricao || event.tipo || '').trim();
  return /^\d{3}$/.test(description) &&
    Number(description) >= 100 &&
    Number(description) <= 599;
}

function isLegacyGenericTransitEvent(event = {}) {
  const type = normalizeEventText(event.tipo);
  const description = normalizeEventText(event.descricao);
  const details = eventSourceDetails(event);

  if (details.sourceKey) return false;

  return (
    ['EM TRANSITO', 'OCORRENCIA'].includes(type) &&
    ['EM TRANSITO', '200', 'CARGA LOCALIZADA NA JAMEF'].includes(description)
  );
}

async function cleanupLegacyTimelineEvents(trackingId, hasDetailedEvents) {
  const events = await prisma.shipmentEvent.findMany({
    where: { trackingId },
    orderBy: [{ dataEvento: 'asc' }, { createdAt: 'asc' }]
  });

  const removableIds = events
    .filter((event) => {
      if (technicalEvent(event.tipo)) return false;

      const type = normalizeEventText(event.tipo);
      if (['CRIADO', 'CADASTRO_MANUAL', 'CADASTRO MANUAL'].includes(type)) return false;

      if (isInvalidCarrierOccurrence(event)) return true;
      return hasDetailedEvents && isLegacyGenericTransitEvent(event);
    })
    .map((event) => event.id);

  if (removableIds.length) {
    await prisma.shipmentEvent.deleteMany({
      where: { id: { in: removableIds } }
    });
  }
}

async function upsertCarrierOccurrence(trackingId, externalEvent, now) {
  const stage = classifyTrackingEvent(externalEvent);
  const sourceDate =
    parseDate(externalEvent.dataEvento || externalEvent.dataEntrega) ||
    now;
  const key = occurrenceKey(externalEvent);
  const details = eventSourceDetails(externalEvent);

  const allEvents = await prisma.shipmentEvent.findMany({
    where: { trackingId },
    orderBy: [{ dataEvento: 'asc' }, { createdAt: 'asc' }]
  });

  const matchingEvents = allEvents.filter((event) => {
    if (technicalEvent(event.tipo)) return false;

    const type = normalizeEventText(event.tipo);
    if (['CRIADO', 'CADASTRO_MANUAL', 'CADASTRO MANUAL'].includes(type)) return false;

    return occurrenceKey(event) === key;
  });

  const existing = matchingEvents[0] || null;

  if (matchingEvents.length > 1) {
    await prisma.shipmentEvent.deleteMany({
      where: { id: { in: matchingEvents.slice(1).map((event) => event.id) } }
    });
  }

  const occurrenceTitle = String(
    externalEvent.descricao ||
    externalEvent.ultimaOcorrencia ||
    externalEvent.status ||
    externalEvent.tipo ||
    stage.descricao ||
    'Ocorrência logística'
  ).trim();

  const eventData = {
    // A timeline usa o texto real devolvido pela transportadora.
    tipo: occurrenceTitle,
    descricao: occurrenceTitle,
    dataEvento: sourceDate,
    cidade:
      scalarText(externalEvent.cidade) ||
      details.municipioOrigem ||
      details.municipioDestino ||
      null,
    uf:
      scalarText(externalEvent.uf) ||
      details.estadoOrigem ||
      details.estadoDestino ||
      null,
    rawResponse: toJsonSafe({
      providerEvent: externalEvent.rawResponse || externalEvent,
      sourceKey: key,
      sourceEventDate: sourceDate.toISOString(),
      refreshedAt: now.toISOString(),
      timelineStage: stage.key,
      estadoOrigem: details.estadoOrigem,
      municipioOrigem: details.municipioOrigem,
      estadoDestino: details.estadoDestino,
      municipioDestino: details.municipioDestino
    })
  };

  if (existing) {
    await prisma.shipmentEvent.update({
      where: { id: existing.id },
      data: eventData
    });
  } else {
    await prisma.shipmentEvent.create({
      data: {
        trackingId,
        ...eventData
      }
    });
  }

  return stage;
}

async function saveExternalEvents(tracking, realTracking, now) {
  await normalizeCreatedEvent(tracking.id);

  const externalEvents = realTracking.eventos?.length
    ? realTracking.eventos
    : (realTracking.ultimaOcorrencia || realTracking.status)
      ? [{
          tipo: realTracking.ultimaOcorrencia || realTracking.status || 'OCORRENCIA',
          descricao: realTracking.ultimaOcorrencia || realTracking.status,
          dataEvento: realTracking.dataEvento || realTracking.dataEntrega || now,
          dataEntrega: realTracking.dataEntrega || null,
          cidade: realTracking.cidade,
          uf: realTracking.uf,
          estadoOrigem: realTracking.ufOrigem,
          municipioOrigem: realTracking.cidadeOrigem,
          estadoDestino: realTracking.uf,
          municipioDestino: realTracking.cidade,
          rawResponse: realTracking.rawResponse || realTracking
        }]
      : [];

  const validEvents = externalEvents.filter(
    (event) => !isInvalidCarrierOccurrence(event)
  );

  await cleanupLegacyTimelineEvents(
    tracking.id,
    validEvents.length > 0
  );

  const orderedEvents = [...validEvents].sort((a, b) => {
    const aTime = parseDate(a.dataEvento || a.dataEntrega)?.getTime() || 0;
    const bTime = parseDate(b.dataEvento || b.dataEntrega)?.getTime() || 0;
    return aTime - bTime;
  });

  let latestStage = null;

  for (const externalEvent of orderedEvents) {
    latestStage = await upsertCarrierOccurrence(
      tracking.id,
      externalEvent,
      now
    );
  }

  if (!latestStage && (realTracking.status || realTracking.ultimaOcorrencia)) {
    latestStage = classifyTrackingEvent({
      tipo: realTracking.status,
      descricao: realTracking.ultimaOcorrencia || realTracking.status,
      dataEntrega: realTracking.dataEntrega
    });
  }

  return latestStage;
}

async function checkTrackingNow(id, user = null) {
  const trackingId = Number(id);
  if (!trackingId) throw new Error('Tracking inválido.');
  if (activeChecks.has(trackingId)) return getTrackingById(trackingId, user);

  let tracking = null;
  activeChecks.add(trackingId);

  try {
    tracking = await prisma.shipmentTracking.findFirst({
      where: { id: trackingId, ...accessWhere(user) },
      include: trackingInclude
    });

    if (!tracking) throw new Error('Tracking não encontrado.');
    if (!tracking.carrier || !tracking.carrier.ativo) {
      throw new Error('Transportadora não encontrada ou inativa.');
    }

    const provider = providerForCarrier(tracking.carrier);
    const credential = await getTrackingCredential(tracking, tracking.carrier);
    const availability = await evaluateTrackingCarrier(tracking.carrier, credential);

    if (!availability.available || !provider?.trackShipment) {
      throw new Error(
        `${tracking.carrier.nome}: ${availability.reason || 'Consulta automática não implementada.'}`
      );
    }

    const realTracking = await provider.trackShipment({
      documento: tracking.documento,
      notaFiscal: tracking.numeroNota,
      pedido: tracking.numeroPedido,
      conhecimento: tracking.conhecimento,
      credential
    });

    const now = new Date();
    const latestStage = await saveExternalEvents(tracking, realTracking, now);

    const status =
      latestStage?.status ||
      (isDeliveredStatus(realTracking.status) || isDeliveredStatus(realTracking.ultimaOcorrencia)
        ? 'Entregue'
        : realTracking.status || realTracking.ultimaOcorrencia
          ? 'Em trânsito'
          : tracking.status || 'Consultado');
    const providerDeliveryDate = parseDate(realTracking.dataEntrega);
    const delivered = Boolean(tracking.dataEntrega) ||
      isDeliveredStatus(status) ||
      isDeliveredStatus(realTracking.ultimaOcorrencia) ||
      Boolean(providerDeliveryDate);
    const deliveryDate = providerDeliveryDate || (delivered ? now : tracking.dataEntrega);

    await prisma.shipmentTracking.update({
      where: { id: tracking.id },
      data: {
        status,
        previsaoEntrega: parseDate(realTracking.previsaoEntrega) || tracking.previsaoEntrega,
        dataEntrega: deliveryDate,
        cidadeDestino: scalarText(realTracking.cidade) || tracking.cidadeDestino,
        ufDestino: scalarText(realTracking.uf) || tracking.ufDestino,
        monitoringActive: !delivered,
        lastCheckedAt: now,
        nextCheckAt: delivered ? addMinutes(now, tracking.checkIntervalMinutes) : nextAttemptDate(tracking),
        lastCheckError: null,
        consecutiveErrors: 0,
        notificationSentAt: delivered && !tracking.dataEntrega ? null : tracking.notificationSentAt,
        emailNotificationNextAttemptAt:
          delivered && !tracking.dataEntrega && !tracking.emailNotificationSentAt
            ? now
            : tracking.emailNotificationNextAttemptAt,
        emailNotificationError:
          delivered && !tracking.dataEntrega ? null : tracking.emailNotificationError,
        rawResponse: toJsonSafe({
          transportadora: tracking.carrier.nome,
          consulta: realTracking.rawResponse || realTracking
        })
      }
    });

    console.log('Tracking aplicado ao FreteHub:', {
      trackingId: tracking.id,
      transportadora: tracking.carrier.nome,
      status,
      ultimaOcorrencia: realTracking.ultimaOcorrencia || realTracking.status || null,
      previsaoEntrega: realTracking.previsaoEntrega || null,
      destino: realTracking.cidade && realTracking.uf
        ? `${realTracking.cidade}/${realTracking.uf}`
        : realTracking.cidade || realTracking.uf || null
    });

    return getTrackingById(tracking.id, user);
  } catch (error) {
    if (tracking) {
      const now = new Date();
      await prisma.shipmentTracking.update({
        where: { id: tracking.id },
        data: {
          lastCheckedAt: now,
          nextCheckAt: nextAttemptDate(tracking, true),
          lastCheckError: error.message,
          consecutiveErrors: { increment: 1 }
        }
      });
    }
    throw error;
  } finally {
    activeChecks.delete(trackingId);
  }
}

async function processDueTrackings(limit = 20) {
  const due = await prisma.shipmentTracking.findMany({
    where: { monitoringActive: true, nextCheckAt: { lte: new Date() } },
    orderBy: { nextCheckAt: 'asc' },
    take: limit,
    select: { id: true }
  });

  const results = [];
  for (const row of due) {
    const claimed = await prisma.shipmentTracking.updateMany({
      where: {
        id: row.id,
        monitoringActive: true,
        nextCheckAt: { lte: new Date() }
      },
      data: {
        nextCheckAt: addMinutes(new Date(), 5)
      }
    });

    if (!claimed.count) continue;

    try {
      await checkTrackingNow(row.id);
      results.push({ id: row.id, success: true });
    } catch (error) {
      results.push({ id: row.id, success: false, error: error.message });
    }
  }
  return results;
}

function nextEmailAttemptDate(attempts = 0) {
  const minutes = Math.min(15 * (2 ** Math.max(Number(attempts), 0)), 24 * 60);
  return addMinutes(new Date(), minutes);
}

async function processPendingDeliveryEmails(limit = 20) {
  const now = new Date();
  const pending = await prisma.shipmentTracking.findMany({
    where: {
      dataEntrega: { not: null },
      emailNotificationSentAt: null,
      OR: [
        { emailNotificationNextAttemptAt: null },
        { emailNotificationNextAttemptAt: { lte: now } }
      ]
    },
    orderBy: [
      { emailNotificationNextAttemptAt: 'asc' },
      { dataEntrega: 'asc' }
    ],
    take: Math.min(Number(limit) || 20, 100),
    include: trackingInclude
  });

  const results = [];

  for (const tracking of pending) {
    const claimed = await prisma.shipmentTracking.updateMany({
      where: {
        id: tracking.id,
        emailNotificationSentAt: null,
        OR: [
          { emailNotificationNextAttemptAt: null },
          { emailNotificationNextAttemptAt: { lte: new Date() } }
        ]
      },
      data: {
        // Reserva curta para impedir que dois workers enviem o mesmo e-mail ao mesmo tempo.
        emailNotificationNextAttemptAt: addMinutes(new Date(), 5)
      }
    });

    if (!claimed.count) continue;

    try {
      const delivery = await sendDeliveryEmail(tracking);
      const sentAt = new Date();

      await prisma.$transaction([
        prisma.shipmentTracking.update({
          where: { id: tracking.id },
          data: {
            emailNotificationSentAt: sentAt,
            emailNotificationError: null,
            emailNotificationNextAttemptAt: null
          }
        }),
        prisma.shipmentEvent.create({
          data: {
            trackingId: tracking.id,
            tipo: 'NOTIFICACAO_EMAIL_ENVIADA',
            descricao: `Notificação de entrega enviada por e-mail para ${delivery.recipients.join(', ')}.`,
            dataEvento: sentAt,
            rawResponse: {
              automatic: true,
              provider: delivery.provider,
              recipients: delivery.recipients
            }
          }
        })
      ]);

      results.push({ id: tracking.id, success: true });
    } catch (error) {
      const attempts = Number(tracking.emailNotificationAttempts || 0) + 1;
      await prisma.shipmentTracking.update({
        where: { id: tracking.id },
        data: {
          emailNotificationAttempts: { increment: 1 },
          emailNotificationError: error.message,
          emailNotificationNextAttemptAt: nextEmailAttemptDate(attempts)
        }
      });

      results.push({ id: tracking.id, success: false, error: error.message });
    }
  }

  return results;
}

async function getTrackingById(id, user = null) {
  const tracking = await prisma.shipmentTracking.findFirst({
    where: { id: Number(id), ...accessWhere(user) },
    include: trackingInclude
  });

  return tracking ? normalizeTracking(tracking) : null;
}

async function pendingDeliveryNotifications(user) {
  const rows = await prisma.shipmentTracking.findMany({
    where: {
      ...accessWhere(user),
      notificationSentAt: null,
      dataEntrega: { not: null }
    },
    orderBy: { dataEntrega: 'desc' },
    take: 20,
    include: trackingInclude
  });

  return rows.map(normalizeTracking);
}

async function acknowledgeDeliveryNotification(id, user) {
  const tracking = await prisma.shipmentTracking.findFirst({
    where: { id: Number(id), ...accessWhere(user), dataEntrega: { not: null } },
    select: { id: true }
  });

  if (!tracking) throw new Error('Notificação de entrega não encontrada.');

  await prisma.shipmentTracking.update({
    where: { id: tracking.id },
    data: { notificationSentAt: new Date() }
  });

  return { success: true };
}


function normalizeTracking(tracking) {
  const mappedEvents = (tracking.events || [])
    .filter((event) => !technicalEvent(event.tipo))
    .map((event) => {
      const isCreated = ['CADASTRO_MANUAL', 'CRIADO'].includes(
        String(event.tipo || '').toUpperCase()
      );
      const details = eventSourceDetails(event);

      return {
        ...event,
        tipo: isCreated
          ? 'CRIADO'
          : event.tipo,
        descricao: isCreated
          ? 'Carga criada e incluída manualmente no monitoramento.'
          : event.descricao,
        estadoOrigem: details.estadoOrigem,
        municipioOrigem: details.municipioOrigem,
        estadoDestino: details.estadoDestino,
        municipioDestino: details.municipioDestino,
        sourceKey: details.sourceKey
      };
    });

  const createdEvents = mappedEvents
    .filter((event) => normalizeEventText(event.tipo) === 'CRIADO')
    .sort((a, b) => {
      const aTime = parseDate(a.createdAt || a.dataEvento)?.getTime() || 0;
      const bTime = parseDate(b.createdAt || b.dataEvento)?.getTime() || 0;
      return aTime - bTime;
    });

  const carrierEvents = mappedEvents
    .filter((event) => normalizeEventText(event.tipo) !== 'CRIADO')
    .filter((event) => !isInvalidCarrierOccurrence(event))
    .sort((a, b) => {
      const aTime = parseDate(a.dataEvento || a.createdAt)?.getTime() || 0;
      const bTime = parseDate(b.dataEvento || b.createdAt)?.getTime() || 0;
      return aTime - bTime;
    });

  // "CRIADO" permanece sempre no topo. Depois vêm as ocorrências reais
  // da transportadora na mesma ordem cronológica exibida no portal.
  const logisticsEvents = [
    ...(createdEvents.length ? [createdEvents[0]] : []),
    ...carrierEvents
  ];

  const lastCarrierEvent = carrierEvents.length
    ? carrierEvents[carrierEvents.length - 1]
    : null;

  const displayStatus =
    tracking.status === 'Cadastrado para monitoramento'
      ? 'Criado'
      : tracking.status || lastCarrierEvent?.tipo || 'Criado';

  return {
    id: tracking.id,
    companyId: tracking.companyId,
    company: tracking.company || null,
    carrierId: tracking.carrierId,
    userId: tracking.userId,
    user: tracking.user || null,
    createdAt: tracking.createdAt,
    updatedAt: tracking.updatedAt,
    monitoringActive: tracking.monitoringActive,
    checkIntervalMinutes: tracking.checkIntervalMinutes,
    lastCheckedAt: tracking.lastCheckedAt,
    nextCheckAt: tracking.nextCheckAt,
    lastCheckError: tracking.lastCheckError,
    consecutiveErrors: tracking.consecutiveErrors,
    notificationSentAt: tracking.notificationSentAt,
    emailNotificationSentAt: tracking.emailNotificationSentAt,
    emailNotificationError: tracking.emailNotificationError,
    emailNotificationAttempts: tracking.emailNotificationAttempts,
    transportadora:
      tracking.carrier?.nome ||
      tracking.rawResponse?.transportadora ||
      '-',
    documento: tracking.documento,
    notaFiscal: tracking.numeroNota,
    pedido: tracking.numeroPedido,
    conhecimento: tracking.conhecimento,
    status: displayStatus,
    cidade:
      tracking.cidadeDestino ||
      lastCarrierEvent?.municipioDestino ||
      lastCarrierEvent?.cidade ||
      '-',
    uf:
      tracking.ufDestino ||
      lastCarrierEvent?.estadoDestino ||
      lastCarrierEvent?.uf ||
      '-',
    previsaoEntrega: formatDateBR(tracking.previsaoEntrega),
    dataEntrega: formatDateBR(tracking.dataEntrega),
    ultimaOcorrencia:
      lastCarrierEvent?.descricao ||
      lastCarrierEvent?.tipo ||
      '-',
    eventos: logisticsEvents
  };
}

module.exports = {
  listTrackings,
  listAvailableCarriers,
  createTracking,
  updateTracking,
  deleteTracking,
  addTrackingEvent,
  getTrackingById,
  checkTrackingNow,
  processDueTrackings,
  processPendingDeliveryEmails,
  pendingDeliveryNotifications,
  acknowledgeDeliveryNotification
};
