const pool = require('../db/pool');
const { decrypt } = require('./crypto');

/** Retorna as credenciais de uma marca já descriptografadas, prontas pra usar nas integrações. */
async function getTenantCredentials(tenantId) {
  const result = await pool.query('SELECT * FROM tenant_credentials WHERE tenant_id = $1', [tenantId]);
  const row = result.rows[0];
  if (!row) return null;

  return {
    shopify: {
      storeDomain: row.shopify_store_domain,
      adminApiToken: decrypt(row.shopify_admin_api_token),
      webhookSecret: decrypt(row.shopify_webhook_secret),
    },
    whatsapp: {
      phoneNumberId: row.whatsapp_phone_number_id,
      accessToken: decrypt(row.whatsapp_access_token),
      verifyToken: row.whatsapp_verify_token,
      appSecret: decrypt(row.whatsapp_app_secret),
    },
    mercadoPago: {
      accessToken: decrypt(row.mp_access_token),
      webhookSecret: decrypt(row.mp_webhook_secret),
    },
    email: {
      host: row.smtp_host,
      port: row.smtp_port,
      user: row.smtp_user,
      pass: decrypt(row.smtp_pass),
      from: row.email_from,
    },
    ai: {
      anthropicApiKey: decrypt(row.anthropic_api_key),
      transcriptionApiKey: decrypt(row.transcription_api_key),
    },
  };
}

module.exports = { getTenantCredentials };
