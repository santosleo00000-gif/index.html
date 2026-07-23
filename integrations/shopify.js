const axios = require('axios');
const crypto = require('crypto');
const pool = require('../db/pool');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

const shopifyClient = axios.create({
  baseURL: `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}`,
  headers: {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_TOKEN,
    'Content-Type': 'application/json',
  },
});

/**
 * Valida a assinatura HMAC de um webhook da Shopify.
 * Shopify manda o header X-Shopify-Hmac-Sha256, calculado sobre o corpo RAW (sem parsear).
 */
function verifyWebhookHmac(rawBody, hmacHeader) {
  if (!process.env.SHOPIFY_WEBHOOK_SECRET) {
    console.warn('[Shopify] SHOPIFY_WEBHOOK_SECRET ainda não configurado - rejeitando webhook por segurança.');
    return false;
  }
  const generatedHash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(generatedHash), Buffer.from(hmacHeader || ''));
}

/**
 * Cria ou atualiza um lead no banco a partir dos dados de customer da Shopify.
 */
async function upsertLeadFromShopifyCustomer(customer) {
  const phone = normalizePhone(customer.phone || customer?.default_address?.phone);
  const result = await pool.query(
    `INSERT INTO leads (shopify_customer_id, name, phone, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (shopify_customer_id)
     DO UPDATE SET name = $2, phone = $3, email = $4, updated_at = now()
     RETURNING *`,
    [
      String(customer.id),
      `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
      phone,
      customer.email,
    ]
  );
  return result.rows[0];
}

/**
 * Cria ou atualiza um pedido no banco a partir do payload de order da Shopify.
 */
async function upsertOrderFromShopifyOrder(order, leadId) {
  const paymentStatus = mapFinancialStatus(order.financial_status);
  const fulfillmentStatus = order.fulfillment_status || 'unfulfilled';

  const result = await pool.query(
    `INSERT INTO orders (shopify_order_id, lead_id, order_number, total_amount, payment_status, fulfillment_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (shopify_order_id)
     DO UPDATE SET payment_status = $5, fulfillment_status = $6, updated_at = now()
     RETURNING *`,
    [String(order.id), leadId, order.name, order.total_price, paymentStatus, fulfillmentStatus]
  );
  return result.rows[0];
}

function mapFinancialStatus(status) {
  const map = {
    paid: 'paid',
    pending: 'pending',
    refunded: 'refunded',
    voided: 'cancelled',
    partially_paid: 'pending',
    partially_refunded: 'paid',
  };
  return map[status] || 'pending';
}

/** Normaliza telefone para o formato E.164 esperado pelo WhatsApp Cloud API (ex: 5511999998888) */
function normalizePhone(rawPhone) {
  if (!rawPhone) return null;
  let digits = rawPhone.replace(/\D/g, '');
  if (!digits.startsWith('55')) digits = `55${digits}`;
  return digits;
}

/**
 * Sincroniza toda a base de clientes existente na Shopify com a tabela leads.
 * Útil para rodar uma vez no início, ou periodicamente via cron.
 */
async function syncAllCustomers() {
  let url = '/customers.json?limit=250';
  let total = 0;
  while (url) {
    const response = await shopifyClient.get(url);
    const customers = response.data.customers;
    for (const customer of customers) {
      await upsertLeadFromShopifyCustomer(customer);
      total++;
    }
    // Shopify usa paginação via header Link (cursor-based)
    const linkHeader = response.headers['link'];
    url = extractNextPageUrl(linkHeader);
  }
  console.log(`[Shopify] Sincronização concluída: ${total} leads.`);
  return total;
}

function extractNextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.split(',').find((part) => part.includes('rel="next"'));
  if (!match) return null;
  const urlMatch = match.match(/<([^>]+)>/);
  if (!urlMatch) return null;
  // Extrai apenas o path + query relativo (o client já tem baseURL)
  const fullUrl = new URL(urlMatch[1]);
  return `${fullUrl.pathname}${fullUrl.search}`.replace(`/admin/api/${API_VERSION}`, '');
}

module.exports = {
  shopifyClient,
  verifyWebhookHmac,
  upsertLeadFromShopifyCustomer,
  upsertOrderFromShopifyOrder,
  normalizePhone,
  syncAllCustomers,
};
