const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../db');
const { notifyDeliveryProof } = require('./notification.service');

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png']
]);

function storageRoot() {
  return path.resolve(
    process.env.DELIVERY_PROOF_DIR || path.join(__dirname, '../../storage/delivery-proofs')
  );
}

function safeFileName(value) {
  return String(value || 'comprovante')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'comprovante';
}

function normalizeExternalUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error('Informe uma URL válida para o comprovante.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('A URL do comprovante deve usar HTTP ou HTTPS.');
  }
  return parsed.toString();
}

function decodeBase64Payload(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const dataUri = text.match(/^data:([^;,]+);base64,(.+)$/s);
  const raw = dataUri ? dataUri[2] : text;
  try {
    return Buffer.from(raw, 'base64');
  } catch {
    throw new Error('O conteúdo do arquivo não está em Base64 válido.');
  }
}

async function ensureTracking(trackingId) {
  const tracking = await prisma.shipmentTracking.findUnique({
    where: { id: Number(trackingId) },
    include: {
      carrier: { select: { id: true, nome: true } },
      company: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      user: { select: { id: true, name: true } }
    }
  });
  if (!tracking) throw new Error('Tracking não encontrado.');
  return tracking;
}

function normalizeProof(proof) {
  return {
    id: proof.id,
    trackingId: proof.trackingId,
    source: proof.source,
    fileName: proof.fileName,
    mimeType: proof.mimeType,
    externalUrl: proof.externalUrl,
    description: proof.description,
    createdAt: proof.createdAt,
    updatedAt: proof.updatedAt,
    uploadedBy: proof.uploadedBy || null,
    hasFile: Boolean(proof.storagePath),
    downloadUrl: proof.storagePath
      ? `/tracking/${proof.trackingId}/proofs/${proof.id}/download`
      : null
  };
}

const proofInclude = {
  uploadedBy: { select: { id: true, name: true } }
};

async function listDeliveryProofs(trackingId) {
  await ensureTracking(trackingId);
  const proofs = await prisma.deliveryProof.findMany({
    where: { trackingId: Number(trackingId) },
    orderBy: { createdAt: 'desc' },
    include: proofInclude
  });
  return proofs.map(normalizeProof);
}

async function createManualDeliveryProof(trackingId, body = {}, user) {
  const tracking = await ensureTracking(trackingId);
  const externalUrl = normalizeExternalUrl(body.externalUrl);
  const mimeType = String(body.mimeType || '').trim().toLowerCase();
  const buffer = decodeBase64Payload(body.dataBase64);

  if (!externalUrl && !buffer) {
    throw new Error('Anexe um arquivo ou informe o link do comprovante.');
  }

  let storagePath = null;
  let fileName = String(body.fileName || '').trim() || null;
  let normalizedMime = mimeType || null;

  if (buffer) {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error('Formato não permitido. Use PDF, JPG, JPEG ou PNG.');
    }
    if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
      throw new Error('O comprovante deve ter no máximo 8 MB.');
    }

    const extension = ALLOWED_MIME_TYPES.get(mimeType);
    const requestedName = safeFileName(fileName || `comprovante${extension}`);
    const baseName = requestedName.toLowerCase().endsWith(extension)
      ? requestedName.slice(0, -extension.length)
      : requestedName.replace(/\.[^.]+$/, '');
    const storedName = `${Date.now()}-${crypto.randomUUID()}-${baseName}${extension}`;
    const directory = storageRoot();
    await fs.mkdir(directory, { recursive: true });
    const absolutePath = path.join(directory, storedName);
    await fs.writeFile(absolutePath, buffer, { flag: 'wx' });
    storagePath = path.relative(storageRoot(), absolutePath);
    fileName = `${baseName}${extension}`;
    normalizedMime = mimeType;
  }

  const proof = await prisma.deliveryProof.create({
    data: {
      trackingId: tracking.id,
      uploadedById: user?.id || null,
      source: 'MANUAL',
      fileName,
      mimeType: normalizedMime,
      storagePath,
      externalUrl,
      description: String(body.description || '').trim() || null
    },
    include: proofInclude
  });

  await prisma.auditLog.create({
    data: {
      userId: user?.id || null,
      action: 'DELIVERY_PROOF_CREATE',
      entity: 'DeliveryProof',
      entityId: String(proof.id),
      payload: {
        trackingId: tracking.id,
        source: proof.source,
        fileName: proof.fileName,
        externalUrl: proof.externalUrl
      }
    }
  }).catch(() => null);

  await notifyDeliveryProof(tracking, proof).catch((error) => {
    console.warn(`Falha ao criar notificação do comprovante #${proof.id}: ${error.message}`);
  });

  return normalizeProof(proof);
}

async function getDeliveryProofFile(trackingId, proofId) {
  await ensureTracking(trackingId);
  const proof = await prisma.deliveryProof.findFirst({
    where: { id: Number(proofId), trackingId: Number(trackingId) },
    include: proofInclude
  });
  if (!proof) throw new Error('Comprovante não encontrado.');
  if (!proof.storagePath) throw new Error('Este comprovante está disponível apenas por link externo.');

  const absolutePath = path.resolve(storageRoot(), proof.storagePath);
  const root = storageRoot();
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error('Caminho de comprovante inválido.');
  }
  await fs.access(absolutePath);
  return { proof: normalizeProof(proof), absolutePath };
}

async function deleteDeliveryProof(trackingId, proofId, user) {
  await ensureTracking(trackingId);
  const proof = await prisma.deliveryProof.findFirst({
    where: { id: Number(proofId), trackingId: Number(trackingId) }
  });
  if (!proof) throw new Error('Comprovante não encontrado.');

  await prisma.deliveryProof.delete({ where: { id: proof.id } });
  if (proof.storagePath) {
    const absolutePath = path.resolve(storageRoot(), proof.storagePath);
    const root = storageRoot();
    if (absolutePath.startsWith(`${root}${path.sep}`)) {
      await fs.unlink(absolutePath).catch(() => null);
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: user?.id || null,
      action: 'DELIVERY_PROOF_DELETE',
      entity: 'DeliveryProof',
      entityId: String(proof.id),
      payload: { trackingId: Number(trackingId), fileName: proof.fileName, externalUrl: proof.externalUrl }
    }
  }).catch(() => null);

  return { success: true };
}

function normalizedKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function collectProviderProofCandidates(value, keyPath = '', results = [], seen = new WeakSet()) {
  if (value == null) return results;
  if (typeof value === 'object') {
    if (seen.has(value)) return results;
    seen.add(value);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectProviderProofCandidates(item, `${keyPath}[${index}]`, results, seen));
    return results;
  }

  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      collectProviderProofCandidates(item, keyPath ? `${keyPath}.${key}` : key, results, seen);
    }
    return results;
  }

  const text = String(value || '').trim();
  const normalizedPath = normalizedKey(keyPath);
  const proofKey = ['comprovante', 'canhoto', 'proof', 'pod', 'recebedor', 'assinatura'].some((term) => normalizedPath.includes(term));
  if (!proofKey) return results;

  if (/^https?:\/\//i.test(text)) {
    try {
      results.push({ externalUrl: normalizeExternalUrl(text), description: `Comprovante disponibilizado pela transportadora (${keyPath}).` });
    } catch {
      // Ignora URLs inválidas recebidas da integração.
    }
  }

  const dataUri = text.match(/^data:(application\/pdf|image\/jpeg|image\/png);base64,(.+)$/s);
  if (dataUri) {
    results.push({
      dataBase64: text,
      mimeType: dataUri[1].toLowerCase(),
      fileName: `comprovante-transportadora${ALLOWED_MIME_TYPES.get(dataUri[1].toLowerCase())}`,
      description: `Documento de comprovante retornado pela transportadora (${keyPath}).`
    });
  }
  return results;
}

async function deleteDeliveryProofFilesForTracking(trackingId) {
  const proofs = await prisma.deliveryProof.findMany({
    where: { trackingId: Number(trackingId), storagePath: { not: null } },
    select: { storagePath: true }
  });
  const root = storageRoot();
  await Promise.all(proofs.map(async (proof) => {
    const absolutePath = path.resolve(root, proof.storagePath);
    if (absolutePath.startsWith(`${root}${path.sep}`)) {
      await fs.unlink(absolutePath).catch(() => null);
    }
  }));
}

async function syncProviderDeliveryProofs(tracking, realTracking) {
  const candidates = collectProviderProofCandidates(realTracking);
  const unique = new Map(candidates.map((candidate) => {
    if (candidate.externalUrl) return [`url:${candidate.externalUrl}`, candidate];
    const buffer = decodeBase64Payload(candidate.dataBase64);
    return [`file:${crypto.createHash('sha256').update(buffer).digest('hex')}`, { ...candidate, buffer }];
  }));
  const created = [];

  for (const [candidateKey, candidate] of unique.entries()) {
    let storagePath = null;
    let fileName = candidate.fileName || null;
    let mimeType = candidate.mimeType || null;

    if (candidate.externalUrl) {
      const existing = await prisma.deliveryProof.findFirst({
        where: { trackingId: tracking.id, externalUrl: candidate.externalUrl }
      });
      if (existing) continue;
    } else if (candidate.buffer) {
      if (!ALLOWED_MIME_TYPES.has(mimeType) || candidate.buffer.length > MAX_FILE_BYTES) continue;
      const hash = candidateKey.slice(5);
      const extension = ALLOWED_MIME_TYPES.get(mimeType);
      const storedName = `provider-${tracking.id}-${hash}${extension}`;
      storagePath = storedName;
      const existing = await prisma.deliveryProof.findFirst({
        where: { trackingId: tracking.id, storagePath }
      });
      if (existing) continue;
      await fs.mkdir(storageRoot(), { recursive: true });
      await fs.writeFile(path.join(storageRoot(), storedName), candidate.buffer, { flag: 'wx' }).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
      fileName = safeFileName(fileName || `comprovante${extension}`);
    }

    const proof = await prisma.deliveryProof.create({
      data: {
        trackingId: tracking.id,
        source: 'CARRIER',
        fileName,
        mimeType,
        storagePath,
        externalUrl: candidate.externalUrl || null,
        description: candidate.description
      },
      include: proofInclude
    });
    created.push(proof);
    await notifyDeliveryProof(tracking, proof).catch(() => null);
  }

  return created.map(normalizeProof);
}

module.exports = {
  MAX_FILE_BYTES,
  listDeliveryProofs,
  createManualDeliveryProof,
  getDeliveryProofFile,
  deleteDeliveryProof,
  deleteDeliveryProofFilesForTracking,
  syncProviderDeliveryProofs,
  normalizeProof
};
