const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');

const shopifyWebhooks = require('./routes/webhooks.shopify');
const whatsappWebhooks = require('./routes/webhooks.whatsapp');
const mercadopagoWebhooks = require('./routes/webhooks.mercadopago');
const authRoutes = require('./routes/auth');
const dashboardApi = require('./routes/api.dashboard');
const settingsApi = require('./routes/api.settings');
const campaignsApi = require('./routes/api.campaigns');
const { syncAllCustomers } = require('./integrations/shopify');

const app = express();

// Shopify, WhatsApp e Mercado Pago exigem o corpo RAW (não parseado) pra validar assinatura.
app.use('/webhooks/shopify', express.raw({ type: 'application/json' }), shopifyWebhooks);
app.use('/webhooks/whatsapp', express.raw({ type: 'application/json' }), whatsappWebhooks);
app.use('/webhooks/mercadopago', express.raw({ type: 'application/json' }), mercadopagoWebhooks);

app.use(bodyParser.json());
app.use(cookieParser());

// ==== Painel (API) ====
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardApi);
app.use('/api/settings', settingsApi);
app.use('/api/campaigns', campaignsApi);

app.post('/admin/sync-customers', async (req, res) => {
  const providedSecret = req.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || providedSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Não autorizado' });
  }
  try {
    const total = await syncAllCustomers();
    res.json({ success: true, synced: total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ==== Painel (front-end estático) ====
app.use(express.static(path.join(__dirname, '../public')));

module.exports = app;
