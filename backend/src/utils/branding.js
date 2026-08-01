const fs = require('fs/promises');
const path = require('path');
const { companyLogoRoot } = require('../services/company-logo.service');

function normalizeLogoExtension(contentType = '', source = '') {
  const normalizedType = String(contentType).toLowerCase();
  const normalizedSource = String(source).toLowerCase();
  if (normalizedType.includes('jpeg') || normalizedType.includes('jpg') || /\.jpe?g(?:$|\?)/.test(normalizedSource)) return 'jpeg';
  if (normalizedType.includes('png') || /\.png(?:$|\?)/.test(normalizedSource)) return 'png';
  return null;
}

async function loadImageSource(source) {
  const value = String(source || '').trim();
  if (!value) return null;

  const dataMatch = value.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (dataMatch) {
    const rawType = dataMatch[1].toLowerCase();
    return {
      buffer: Buffer.from(dataMatch[2], 'base64'),
      extension: rawType.startsWith('jp') ? 'jpeg' : rawType,
      dataUri: value
    };
  }

  if (!/^https?:\/\//i.test(value)) return null;
  const response = await fetch(value, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Não foi possível carregar a logomarca: HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type') || '';
  const extension = normalizeLogoExtension(contentType, value);
  if (!extension) throw new Error('A logomarca precisa estar em PNG ou JPEG.');
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    extension,
    dataUri: `data:image/${extension === 'jpeg' ? 'jpeg' : extension};base64,${buffer.toString('base64')}`
  };
}

async function loadCompanyLogo(company) {
  if (company?.logoStoragePath) {
    const root = companyLogoRoot();
    const absolute = path.resolve(root, company.logoStoragePath);
    if (absolute !== root && absolute.startsWith(`${root}${path.sep}`)) {
      const buffer = await fs.readFile(absolute);
      const extension = normalizeLogoExtension(company.logoMimeType, company.logoFileName || company.logoStoragePath);
      if (extension) {
        return {
          buffer,
          extension,
          dataUri: `data:image/${extension === 'jpeg' ? 'jpeg' : extension};base64,${buffer.toString('base64')}`
        };
      }
    }
  }
  return loadImageSource(company?.logoUrl);
}

module.exports = { loadImageSource, loadCompanyLogo };
