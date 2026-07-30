const crypto = require('crypto');

function getKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.CRYPTO_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('ENCRYPTION_KEY deve ser configurada com um valor forte.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(data) {
  if (!data) return null;
  const [ivHex, encryptedHex] = String(data).split(':');
  if (!ivHex || !encryptedHex) throw new Error('Credencial criptografada inválida.');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), Buffer.from(ivHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]).toString('utf8');
}

module.exports = { encrypt, decrypt };
