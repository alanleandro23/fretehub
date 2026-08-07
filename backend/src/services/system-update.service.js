const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const PACKAGE_FORMAT = 1;
const MAX_PACKAGE_BYTES = 12 * 1024 * 1024;
const UPDATE_ROOT = path.resolve(
  process.env.FRETEHUB_UPDATE_DIR || path.join(__dirname, '../../storage/system-updates')
);
const PACKAGES_DIR = path.join(UPDATE_ROOT, 'packages');
const HISTORY_DIR = path.join(UPDATE_ROOT, 'history');
const STATUS_FILE = path.join(UPDATE_ROOT, 'status.json');
const CURRENT_FILE = path.join(UPDATE_ROOT, 'current.json');
const REQUEST_FILE = path.join(UPDATE_ROOT, 'install.request');
const AGENT_MARKER = path.join(UPDATE_ROOT, 'agent.ready');

function ensureDirectories() {
  fs.mkdirSync(PACKAGES_DIR, { recursive: true, mode: 0o750 });
  fs.mkdirSync(HISTORY_DIR, { recursive: true, mode: 0o750 });
}

function safeReadJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function atomicWriteJson(file, value) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o640 });
  fs.renameSync(temp, file);
}

function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

function compareVersions(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (!av || !bv) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (av[index] > bv[index]) return 1;
    if (av[index] < bv[index]) return -1;
  }
  return 0;
}

function currentVersion() {
  ensureDirectories();
  const installed = safeReadJson(CURRENT_FILE);
  if (installed?.version) return String(installed.version);

  try {
    const pkg = require('../../package.json');
    return String(pkg.version || '0.0.0');
  } catch (_) {
    return '0.0.0';
  }
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const minimum = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  throw new Error('Arquivo ZIP inválido: diretório central não encontrado.');
}

function parseZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new Error('Pacote de atualização vazio ou inválido.');
  }

  const eocd = findEndOfCentralDirectory(buffer);
  const entriesCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);

  if (centralOffset + centralSize > buffer.length) {
    throw new Error('Arquivo ZIP corrompido.');
  }

  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entriesCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Estrutura ZIP inválida.');
    }

    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;

    if (nameEnd > buffer.length) throw new Error('Nome de entrada ZIP inválido.');

    const name = buffer.subarray(nameStart, nameEnd).toString('utf8').replace(/\\/g, '/');
    const normalized = path.posix.normalize(name);
    if (
      !name ||
      name.startsWith('/') ||
      /^[A-Za-z]:\//.test(name) ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      name.includes('\0')
    ) {
      throw new Error(`Entrada insegura no pacote: ${name || '(sem nome)'}`);
    }

    entries.push({
      name,
      compression,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });

    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function readZipEntry(buffer, entry) {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`Cabeçalho local inválido para ${entry.name}.`);
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + fileNameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length) throw new Error(`Conteúdo truncado em ${entry.name}.`);

  const compressed = buffer.subarray(start, end);
  let data;
  if (entry.compression === 0) data = compressed;
  else if (entry.compression === 8) data = zlib.inflateRawSync(compressed);
  else throw new Error(`Método de compressão não suportado em ${entry.name}.`);

  if (entry.uncompressedSize && data.length !== entry.uncompressedSize) {
    throw new Error(`Tamanho inválido da entrada ${entry.name}.`);
  }
  return data;
}

function validateManifest(raw, entries) {
  let manifest;
  try {
    manifest = JSON.parse(raw.toString('utf8'));
  } catch (_) {
    throw new Error('manifest.json inválido.');
  }

  if (manifest.application !== 'fretehub') {
    throw new Error('Este pacote não pertence ao FreteHub.');
  }
  if (Number(manifest.packageFormat) !== PACKAGE_FORMAT) {
    throw new Error(`Formato de pacote não suportado. Esperado: ${PACKAGE_FORMAT}.`);
  }
  if (!parseVersion(manifest.version)) {
    throw new Error('Versão do pacote inválida. Use o formato X.Y.Z.');
  }
  if (manifest.minimumVersion && !parseVersion(manifest.minimumVersion)) {
    throw new Error('minimumVersion inválida.');
  }
  if (!/^[0-9a-f]{40}$/i.test(String(manifest.targetCommit || ''))) {
    throw new Error('targetCommit inválido no manifesto.');
  }
  if (!entries.some((entry) => entry.name === 'fretehub.bundle')) {
    throw new Error('O pacote não contém fretehub.bundle.');
  }

  const installed = currentVersion();
  if (compareVersions(manifest.version, installed) <= 0) {
    throw new Error(`A versão ${manifest.version} não é superior à versão instalada ${installed}.`);
  }
  if (manifest.minimumVersion && compareVersions(installed, manifest.minimumVersion) < 0) {
    throw new Error(
      `Este pacote exige no mínimo a versão ${manifest.minimumVersion}. Versão instalada: ${installed}.`
    );
  }

  return {
    application: 'fretehub',
    packageFormat: PACKAGE_FORMAT,
    version: String(manifest.version),
    minimumVersion: manifest.minimumVersion ? String(manifest.minimumVersion) : null,
    targetCommit: String(manifest.targetCommit).toLowerCase(),
    requiresDatabaseMigration: Boolean(manifest.requiresDatabaseMigration),
    description: String(manifest.description || '').trim().slice(0, 2000),
    createdAt: manifest.createdAt || null
  };
}

function sanitizeFileName(value) {
  const decoded = (() => {
    try { return decodeURIComponent(String(value || '')); } catch (_) { return String(value || ''); }
  })();
  const base = path.basename(decoded).replace(/[^0-9A-Za-z._-]/g, '_');
  return base || 'fretehub-update.zip';
}

function validateAndStageUpdate(buffer, fileName, user) {
  ensureDirectories();

  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('Nenhum arquivo foi enviado.');
  }
  if (buffer.length > MAX_PACKAGE_BYTES) {
    throw new Error(`Pacote maior que ${Math.floor(MAX_PACKAGE_BYTES / 1024 / 1024)} MB.`);
  }
  if (buffer.readUInt16LE(0) !== 0x4b50) {
    throw new Error('O arquivo enviado não parece ser um ZIP válido.');
  }

  const entries = parseZipEntries(buffer);
  const manifestEntry = entries.find((entry) => entry.name === 'manifest.json');
  if (!manifestEntry) throw new Error('manifest.json não encontrado na raiz do pacote.');
  if (manifestEntry.uncompressedSize > 128 * 1024) throw new Error('manifest.json excede o tamanho permitido.');

  const manifest = validateManifest(readZipEntry(buffer, manifestEntry), entries);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const safeName = sanitizeFileName(fileName);
  const id = `${Date.now()}-${manifest.version.replace(/[^0-9A-Za-z.-]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  const packagePath = path.join(PACKAGES_DIR, `${id}.zip`);
  const metadataPath = path.join(PACKAGES_DIR, `${id}.json`);

  fs.writeFileSync(packagePath, buffer, { mode: 0o640, flag: 'wx' });
  const metadata = {
    id,
    state: 'VALIDATED',
    fileName: safeName,
    packagePath,
    size: buffer.length,
    sha256,
    manifest,
    uploadedAt: new Date().toISOString(),
    uploadedBy: user ? { id: user.id, name: user.name, email: user.email } : null
  };
  atomicWriteJson(metadataPath, metadata);

  return publicMetadata(metadata);
}

function publicMetadata(metadata) {
  if (!metadata) return null;
  return {
    id: metadata.id,
    state: metadata.state,
    fileName: metadata.fileName,
    size: metadata.size,
    sha256: metadata.sha256,
    manifest: metadata.manifest,
    uploadedAt: metadata.uploadedAt,
    uploadedBy: metadata.uploadedBy || null
  };
}

function updaterReady() {
  const enabled = String(process.env.FRETEHUB_UPDATER_ENABLED || '').toLowerCase() === 'true';
  return enabled && fs.existsSync(AGENT_MARKER);
}

function listHistory(limit = 10) {
  ensureDirectories();
  return fs.readdirSync(HISTORY_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((name) => safeReadJson(path.join(HISTORY_DIR, name)))
    .filter(Boolean);
}

function listStaged(limit = 5) {
  ensureDirectories();
  return fs.readdirSync(PACKAGES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((name) => publicMetadata(safeReadJson(path.join(PACKAGES_DIR, name))))
    .filter(Boolean);
}

function getSystemUpdateStatus() {
  ensureDirectories();
  return {
    application: 'FreteHub',
    currentVersion: currentVersion(),
    updaterReady: updaterReady(),
    updaterMode: process.platform === 'linux' ? 'linux' : 'development',
    status: safeReadJson(STATUS_FILE, { state: 'IDLE' }),
    staged: listStaged(5),
    history: listHistory(10)
  };
}

function requestInstall(id, user) {
  ensureDirectories();
  if (!updaterReady()) {
    throw new Error('O agente de atualização do servidor ainda não está habilitado neste ambiente.');
  }
  if (fs.existsSync(REQUEST_FILE)) {
    throw new Error('Já existe uma atualização aguardando processamento.');
  }

  const metadataPath = path.join(PACKAGES_DIR, `${String(id || '')}.json`);
  const metadata = safeReadJson(metadataPath);
  if (!metadata || metadata.state !== 'VALIDATED') {
    throw new Error('Pacote validado não encontrado.');
  }

  const request = {
    updateId: metadata.id,
    requestedAt: new Date().toISOString(),
    requestedBy: user ? { id: user.id, name: user.name, email: user.email } : null
  };
  atomicWriteJson(REQUEST_FILE, request);
  atomicWriteJson(STATUS_FILE, {
    state: 'QUEUED',
    updateId: metadata.id,
    version: metadata.manifest.version,
    message: 'Atualização enfileirada e aguardando o agente do servidor.',
    updatedAt: new Date().toISOString()
  });
  return getSystemUpdateStatus();
}

function deleteStagedUpdate(id) {
  ensureDirectories();
  const safeId = String(id || '');
  if (!/^[0-9A-Za-z.-]+$/.test(safeId)) throw new Error('Identificador inválido.');
  const metadataPath = path.join(PACKAGES_DIR, `${safeId}.json`);
  const metadata = safeReadJson(metadataPath);
  if (!metadata) throw new Error('Pacote não encontrado.');
  if (fs.existsSync(REQUEST_FILE)) {
    const request = safeReadJson(REQUEST_FILE);
    if (request?.updateId === safeId) throw new Error('Este pacote já está aguardando instalação.');
  }
  try { fs.unlinkSync(path.join(PACKAGES_DIR, `${safeId}.zip`)); } catch (_) {}
  try { fs.unlinkSync(metadataPath); } catch (_) {}
  return { success: true };
}

module.exports = {
  MAX_PACKAGE_BYTES,
  getSystemUpdateStatus,
  validateAndStageUpdate,
  requestInstall,
  deleteStagedUpdate
};
