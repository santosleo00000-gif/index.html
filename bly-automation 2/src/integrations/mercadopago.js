const axios = require('axios');
const crypto = require('crypto');

const client = axios.create({
  baseURL: 'https://api.mercadopago.com',
  headers: {
    Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Cria uma cobrança PIX no Mercado Pago para um pedido pendente.
 * Retorna o QR code (texto copia-e-cola) e a imagem em base64.
 */
async function createPixCharge({ orderId, amount, description, payerEmail, expirationMinutes = 30 }) {
  const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString();

  const response = await client.post(
    '/v1/payments',
    {
      transaction_amount: Number(amount),
      description,
      payment_method_id: 'pix',
      payer: { email: payerEmail },
      date_of_expiration: expiresAt,
      external_reference: String(orderId),
    },
    {
      headers: {
        // Idempotência: evita gerar cobrança duplicada em caso de retry
        'X-Idempotency-Key': `pix-${orderId}-${Date.now()}`,
      },
    }
  );

  const { id, point_of_interaction } = response.data;
  return {
    chargeId: id,
    qrCode: point_of_interaction.transaction_data.qr_code,
    qrCodeBase64: point_of_interaction.transaction_data.qr_code_base64,
    expiresAt,
  };
}

/** Consulta o status atual de um pagamento PIX */
async function getPaymentStatus(paymentId) {
  const response = await client.get(`/v1/payments/${paymentId}`);
  return response.data.status; // approved | pending | rejected | cancelled
}

/**
 * Valida a assinatura do webhook do Mercado Pago (x-signature header).
 * Ver documentação: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/webhooks
 */
function verifyWebhookSignature({ xSignature, xRequestId, dataId }) {
  if (!xSignature) return false;
  const parts = Object.fromEntries(xSignature.split(',').map((p) => p.trim().split('=')));
  const { ts, v1 } = parts;
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');
  return expected === v1;
}

module.exports = { client, createPixCharge, getPaymentStatus, verifyWebhookSignature };
