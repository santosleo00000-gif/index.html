const axios = require('axios');
const crypto = require('crypto');

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

const client = axios.create({
  baseURL: `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

/** Valida a assinatura X-Hub-Signature-256 dos webhooks recebidos da Meta */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

/** Envia mensagem de texto livre (só funciona dentro da janela de 24h de atendimento) */
async function sendText(to, body) {
  return client.post('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  });
}

/**
 * Envia um template aprovado (obrigatório fora da janela de 24h, ex: cobranças e
 * atualizações de rastreio disparadas proativamente).
 * `components` segue o formato de variáveis do template configurado no Meta Business Manager.
 */
async function sendTemplate(to, templateName, languageCode = 'pt_BR', components = []) {
  return client.post('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  });
}

/** Baixa um arquivo de mídia (áudio, imagem) recebido via webhook, dado o media_id */
async function downloadMedia(mediaId) {
  const metaResponse = await client.get(`https://graph.facebook.com/v20.0/${mediaId}`, {
    baseURL: '', // sobrescreve o baseURL pra usar URL absoluta
  });
  const fileUrl = metaResponse.data.url;
  const fileResponse = await axios.get(fileUrl, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    responseType: 'arraybuffer',
  });
  return { buffer: fileResponse.data, mimeType: metaResponse.data.mime_type };
}

/** Template pronto pra lembrete de pagamento PIX pendente */
async function sendPixReminder(to, { customerName, orderNumber, amount, pixCopyPaste }) {
  // Nota: o texto abaixo assume que você criou um template chamado "pix_pendente" no
  // Meta Business Manager com essas variáveis, e que ele foi aprovado.
  return sendTemplate(to, 'pix_pendente', 'pt_BR', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: customerName },
        { type: 'text', text: orderNumber },
        { type: 'text', text: amount },
      ],
    },
  ]);
  // O código copia-e-cola do PIX geralmente é melhor mandar como texto livre logo em
  // seguida (se estiver dentro da janela de 24h) ou incluído em botão de cópia no template.
}

/** Template pronto pra atualização de rastreio */
async function sendTrackingUpdate(to, { customerName, orderNumber, trackingCode, statusText }) {
  return sendTemplate(to, 'atualizacao_rastreio', 'pt_BR', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: customerName },
        { type: 'text', text: orderNumber },
        { type: 'text', text: trackingCode },
        { type: 'text', text: statusText },
      ],
    },
  ]);
}

module.exports = {
  client,
  verifyWebhookSignature,
  sendText,
  sendTemplate,
  downloadMedia,
  sendPixReminder,
  sendTrackingUpdate,
};
