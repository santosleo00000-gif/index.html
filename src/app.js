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

app.get('/', (req, res) => {
  const check = (name, value) => Boolean(value);
  const status = {
    banco_de_dados: check('db', process.env.DATABASE_URL),
    shopify: check('shopify', process.env.SHOPIFY_ADMIN_API_TOKEN && process.env.SHOPIFY_WEBHOOK_SECRET),
    whatsapp: check('wa', process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    mercado_pago: check('mp', process.env.MP_ACCESS_TOKEN),
    email: check('email', process.env.SMTP_HOST && process.env.SMTP_USER),
    ia_texto: check('ai', process.env.ANTHROPIC_API_KEY),
    ia_audio: check('stt', process.env.TRANSCRIPTION_API_KEY),
  };

  const rows = Object.entries(status)
    .map(([key, ok]) => `<tr><td>${key.replace(/_/g, ' ')}</td><td>${ok ? '✅ configurado' : '⏳ pendente'}</td></tr>`)
    .join('');

  res.send(`
    <html><head><title>BLY! Automation - Status</title>
    <style>body{font-family:sans-serif;max-width:500px;margin:40px auto;} table{width:100%;border-collapse:collapse;} td{padding:8px;border-bottom:1px solid #eee;}</style>
    </head><body>
      <h2>BLY! Automation está no ar 🎉</h2>
      <p>Isso confirma que o servidor subiu com sucesso. Abaixo, o que já está pronto e o que falta configurar:</p>
      <table>${rows}</table>
      <p style="color:#888; font-size:13px;">Itens "pendente" não impedem o sistema de funcionar — eles só ficam inativos até você preencher a variável de ambiente correspondente no Railway.</p>
    </body></html>
  `);
});

module.exports = app;
