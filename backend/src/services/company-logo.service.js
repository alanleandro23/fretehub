const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg']
]);

function companyLogoRoot() {
  return path.resolve(
    process.env.COMPANY_LOGO_DIR || path.join(__dirname, '../../storage/company-logos')
  );
}

function safeFileName(value) {
  return String(value || 'logo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 100) || 'logo';
}

function decodeBase64(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/^data:([^;,]+);base64,(.+)$/s);
  const raw = match ? match[2] : text;
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw new Error('O arquivo da logomarca está vazio.');
  return buffer;
}

function publicLogoUrl(storagePath) {
  if (!storagePath) return null;
  return `/company-logos/${encodeURIComponent(path.basename(storagePath))}`;
}

function serializeCompany(company) {
  if (!company) return company;
  const uploadedLogoUrl = publicLogoUrl(company.logoStoragePath);
  return {
    ...company,
    uploadedLogoUrl,
    effectiveLogoUrl: uploadedLogoUrl || company.logoUrl || null,
    hasUploadedLogo: Boolean(company.logoStoragePath)
  };
}

async function storeUploadedLogo(body = {}) {
  const mimeType = String(body.logoMimeType || '').trim().toLowerCase();
  const buffer = decodeBase64(body.logoDataBase64);
  if (!buffer) return null;
  if (!ALLOWED_LOGO_TYPES.has(mimeType)) {
    throw new Error('Formato de logomarca não permitido. Use PNG, JPG ou JPEG.');
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new Error('A logomarca deve ter no máximo 5 MB.');
  }

  const extension = ALLOWED_LOGO_TYPES.get(mimeType);
  const requested = safeFileName(body.logoFileName || `logo${extension}`);
  const baseName = requested.replace(/\.[^.]+$/, '') || 'logo';
  const storedName = `${Date.now()}-${crypto.randomUUID()}-${baseName}${extension}`;
  const root = companyLogoRoot();
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, storedName), buffer, { flag: 'wx' });

  return {
    logoFileName: `${baseName}${extension}`,
    logoMimeType: mimeType,
    logoStoragePath: storedName,
    logoUpdatedAt: new Date()
  };
}

async function deleteUploadedLogo(storagePath) {
  if (!storagePath) return;
  const root = companyLogoRoot();
  const absolute = path.resolve(root, storagePath);
  if (absolute === root || !absolute.startsWith(`${root}${path.sep}`)) return;
  await fs.unlink(absolute).catch(() => null);
}

module.exports = {
  companyLogoRoot,
  serializeCompany,
  storeUploadedLogo,
  deleteUploadedLogo,
  publicLogoUrl
};
