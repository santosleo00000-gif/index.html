const express = require('express');
const router = express.Router();
const mercadopago = require('../integrations/mercadopago');
const pool = require('../db/pool');
const whatsapp = require('../integrations/whatsapp');
const email = require('../integrations/email');

router.post('/', async (req, res) => {
  const xSignature = req.get('x-signature');
  const xRequestId = req.get('x-request-id');
  const dataId = req.query['data.id'];

  const valid = mercadopago.verifyWebhookSignature({ xSignature, xRequestId, dataId });
  if (!valid) return res.status(401).send('Assinatura inválida');

  res.status(200).send('ok');

  try {
    const body = JSON.parse(req.body.toString('utf8'));
    if (body.type !== 'payment') return;

    const status = await mercadopago.getPaymentStatus(body.data.id);
    if (status !== 'approved') return;

    const orderResult = await pool.query(
      `UPDATE orders SET payment_status = 'paid', updated_at = now() WHERE pix_charge_id = $1 RETURNING *`,
      [String(body.data.id)]
    );
    const order = orderResult.rows[0];
    if (!order) return;

    const leadResult = await pool.query(`SELECT * FROM leads WHERE id = $1`, [order.lead_id]);
    const lead = leadResult.rows[0];
    if (!lead) return;

    const confirmationMsg = `Recebemos seu pagamento do pedido ${order.order_number}! 🎉 Já vamos preparar sua joia com todo carinho.`;

    if (lead.phone) await whatsapp.sendText(lead.phone, confirmationMsg);
    if (lead.email) {
      await email.sendEmail({
        to: lead.email,
        subject: `Pagamento confirmado - pedido ${order.order_number}`,
        html: `<p>${confirmationMsg}</p>`,
      });
    }
  } catch (err) {
    console.error('[Webhook Mercado Pago] Erro processando notificação:', err);
  }
});

module.exports = router;
