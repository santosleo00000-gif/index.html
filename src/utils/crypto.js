const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY ausente ou inválida. Precisa ser uma string hexadecimal de 64 caracteres (32 bytes).'
    );
  }
  return Buffer.from(hex, 'hex');
}

/** Criptografa um texto. Retorna null se a entrada for vazia (nada a esconder). */
function encrypt(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/** Descriptografa um valor salvo com encrypt(). Retorna null se a entrada for vazia. */
function decrypt(base64Value) {
  if (!base64Value) return null;
  const buf = Buffer.from(base64Value, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/** Mascara um valor pra exibir na tela de configurações sem revelar o segredo completo. */
function mask(value) {
  if (!value) return null;
  if (value.length <= 6) return '••••••';
  return `${value.slice(0, 3)}••••••${value.slice(-3)}`;
}

module.exports = { encrypt, decrypt, mask };
