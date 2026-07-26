const express = require('express');
const router = express.Router();
const shopify = require('../integrations/shopify');
const flows = require('../flows/engine');
const pool = require('../db/pool');

// IMPORTANTE: essa rota precisa do corpo RAW (não parseado) pra validar o HMAC.
// Isso é configurado no index.js com express.raw() só pra essas rotas.

router.post('/orders-create', async (req, res) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  if (!shopify.verifyWebhookHmac(req.body, hmac)) {
    return res.status(401).send('Assinatura inválida');
  }

  const order = JSON.parse(req.body.toString('utf8'));
  res.status(200).send('ok'); // responde rápido, Shopify exige resposta em poucos segundos

  try {
    let lead = null;
    if (order.customer) {
      lead = await shopify.upsertLeadFromShopifyCustomer(order.customer);
    }
    const savedOrder = await shopify.upsertOrderFromShopifyOrder(order, lead?.id);

    if (savedOrder.payment_status === 'pending' && lead) {
      await flows.triggerPixFlow(savedOrder, lead);
    }
  } catch (err) {
    console.error('[Webhook Shopify] Erro processando orders/create:', err);
  }
});

router.post('/orders-paid', async (req, res) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  if (!shopify.verifyWebhookHmac(req.body, hmac)) {
    return res.status(401).send('Assinatura inválida');
  }
  const order = JSON.parse(req.body.toString('utf8'));
  res.status(200).send('ok');

  await pool.query(`UPDATE orders SET payment_status = 'paid', updated_at = now() WHERE shopify_order_id = $1`, [
    String(order.id),
  ]);
});

router.post('/fulfillments-create', async (req, res) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  if (!shopify.verifyWebhookHmac(req.body, hmac)) {
    return res.status(401).send('Assinatura inválida');
  }
  const fulfillment = JSON.parse(req.body.toString('utf8'));
  res.status(200).send('ok');

  try {
    const trackingCode = fulfillment.tracking_number;
    const trackingCarrier = fulfillment.tracking_company;
    const orderResult = await pool.query(
      `UPDATE orders SET fulfillment_status = 'fulfilled', tracking_code = $1, tracking_carrier = $2, tracking_status = 'posted', updated_at = now()
       WHERE shopify_order_id = $3 RETURNING *`,
      [trackingCode, trackingCarrier, String(fulfillment.order_id)]
    );
    const order = orderResult.rows[0];
    if (!order) return;

    const leadResult = await pool.query(`SELECT * FROM leads WHERE id = $1`, [order.lead_id]);
    const lead = leadResult.rows[0];
    if (lead) {
      await flows.triggerTrackingFlow(order, lead, 'Seu pedido foi postado e está a caminho!');
    }
  } catch (err) {
    console.error('[Webhook Shopify] Erro processando fulfillments/create:', err);
  }
});

module.exports = router;
