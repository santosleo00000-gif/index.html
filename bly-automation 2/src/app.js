const express = require('express');
const bodyParser = require('body-parser');

const shopifyWebhooks = require('./routes/webhooks.shopify');
const whatsappWebhooks = require('./routes/webhooks.whatsapp');
const mercadopagoWebhooks = require('./routes/webhooks.mercadopago');
const { syncAllCustomers } = require('./integrations/shopify');

const app = express();

// Shopify, WhatsApp e Mercado Pago exigem o corpo RAW (não parseado) pra validar assinatura.
app.use('/webhooks/shopify', express.raw({ type: 'application/json' }), shopifyWebhooks);
app.use('/webhooks/whatsapp', express.raw({ type: 'application/json' }), whatsappWebhooks);
app.use('/webhooks/mercadopago', express.raw({ type: 'application/json' }), mercadopagoWebhooks);

app.use(bodyParser.json());

app.post('/admin/sync-customers', async (req, res) => {
  try {
    const total = await syncAllCustomers();
    res.json({ success: true, synced: total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
