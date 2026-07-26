const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAuth } = require('../utils/auth');

router.use(requireAuth);

router.get('/summary', async (req, res) => {
  try {
    const [leads, orders, pendingPayments, conversations] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM leads WHERE tenant_id = $1', [req.tenantId]),
      pool.query('SELECT COUNT(*) FROM orders WHERE tenant_id = $1', [req.tenantId]),
      pool.query("SELECT COUNT(*) FROM orders WHERE tenant_id = $1 AND payment_status = 'pending'", [req.tenantId]),
      pool.query('SELECT COUNT(*) FROM conversations WHERE tenant_id = $1', [req.tenantId]),
    ]);
    res.json({
      leads: Number(leads.rows[0].count),
      orders: Number(orders.rows[0].count),
      pendingPayments: Number(pendingPayments.rows[0].count),
      conversations: Number(conversations.rows[0].count),
    });
  } catch (err) {
    console.error('[API] Erro no summary:', err);
    res.status(500).json({ error: 'Erro ao carregar resumo.' });
  }
});

router.get('/leads', async (req, res) => {
  const { search = '', limit = 50, offset = 0 } = req.query;
  try {
    const result = await pool.query(
      `SELECT * FROM leads
       WHERE tenant_id = $1 AND (name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [req.tenantId, `%${search}%`, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[API] Erro ao listar leads:', err);
    res.status(500).json({ error: 'Erro ao carregar leads.' });
  }
});

router.get('/orders', async (req, res) => {
  const { status = '', limit = 50, offset = 0 } = req.query;
  try {
    const params = [req.tenantId];
    let filter = '';
    if (status) {
      params.push(status);
      filter = `AND o.payment_status = $${params.length}`;
    }
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT o.*, l.name AS lead_name, l.phone AS lead_phone, l.email AS lead_email
       FROM orders o LEFT JOIN leads l ON l.id = o.lead_id
       WHERE o.tenant_id = $1 ${filter}
       ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[API] Erro ao listar pedidos:', err);
    res.status(500).json({ error: 'Erro ao carregar pedidos.' });
  }
});

router.get('/conversations', async (req, res) => {
  const { leadId, limit = 50 } = req.query;
  try {
    const params = [req.tenantId];
    let filter = '';
    if (leadId) {
      params.push(leadId);
      filter = `AND c.lead_id = $${params.length}`;
    }
    params.push(limit);
    const result = await pool.query(
      `SELECT c.*, l.name AS lead_name, l.phone AS lead_phone
       FROM conversations c LEFT JOIN leads l ON l.id = c.lead_id
       WHERE c.tenant_id = $1 ${filter}
       ORDER BY c.created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[API] Erro ao listar conversas:', err);
    res.status(500).json({ error: 'Erro ao carregar conversas.' });
  }
});

module.exports = router;
