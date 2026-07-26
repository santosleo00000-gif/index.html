const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAuth } = require('../utils/auth');
const { encrypt, decrypt, mask } = require('../utils/crypto');

router.use(requireAuth);

// Campos que são segredos (criptografados) vs. campos "públicos" (podem aparecer em texto puro)
const SECRET_FIELDS = [
  'shopify_admin_api_token',
  'shopify_webhook_secret',
  'whatsapp_access_token',
  'whatsapp_app_secret',
  'mp_access_token',
  'mp_webhook_secret',
  'smtp_pass',
  'anthropic_api_key',
  'transcription_api_key',
];
const PLAIN_FIELDS = [
  'shopify_store_domain',
  'whatsapp_phone_number_id',
  'whatsapp_verify_token',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'email_from',
];

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tenant_credentials WHERE tenant_id = $1', [req.tenantId]);
    const row = result.rows[0] || {};
    const output = {};
    for (const field of PLAIN_FIELDS) output[field] = row[field] || null;
    for (const field of SECRET_FIELDS) output[field] = mask(row[field] ? decrypt(row[field]) : null);

    const tenantResult = await pool.query('SELECT slug FROM tenants WHERE id = $1', [req.tenantId]);
    output.webhook_base_url = `${req.protocol}://${req.get('host')}/webhooks/${tenantResult.rows[0].slug}`;

    res.json(output);
  } catch (err) {
    console.error('[Settings] Erro ao carregar:', err);
    res.status(500).json({ error: 'Erro ao carregar configurações.' });
  }
});

router.put('/', async (req, res) => {
  try {
    const updates = {};
    for (const field of PLAIN_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    for (const field of SECRET_FIELDS) {
      // Só re-criptografa se o usuário digitou um valor novo (não o placeholder mascarado)
      if (req.body[field] && !req.body[field].includes('••••')) {
        updates[field] = encrypt(req.body[field]);
      }
    }

    const columns = Object.keys(updates);
    if (!columns.length) return res.json({ success: true, message: 'Nada para atualizar.' });

    const setClause = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');
    const values = columns.map((col) => updates[col]);

    await pool.query(
      `UPDATE tenant_credentials SET ${setClause}, updated_at = now() WHERE tenant_id = $1`,
      [req.tenantId, ...values]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Settings] Erro ao salvar:', err);
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

module.exports = router;
