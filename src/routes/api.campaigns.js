const express = require('express');
const router = express.Router();
const axios = require('axios');
const nodemailer = require('nodemailer');
const pool = require('../db/pool');
const { requireAuth } = require('../utils/auth');
const { getTenantCredentials } = require('../utils/tenantCredentials');

router.use(requireAuth);

async function sendWhatsappText(creds, to, body) {
  if (!creds.whatsapp.accessToken || !creds.whatsapp.phoneNumberId) {
    throw new Error('WhatsApp ainda não configurado pra essa marca.');
  }
  return axios.post(
    `https://graph.facebook.com/v20.0/${creds.whatsapp.phoneNumberId}/messages`,
    { messaging_product: 'whatsapp', to, type: 'text', text: { body } },
    { headers: { Authorization: `Bearer ${creds.whatsapp.accessToken}` } }
  );
}

async function sendCampaignEmail(creds, to, subject, html) {
  if (!creds.email.host || !creds.email.user) {
    throw new Error('E-mail ainda não configurado pra essa marca.');
  }
  const transporter = nodemailer.createTransport({
    host: creds.email.host,
    port: creds.email.port || 465,
    secure: true,
    auth: { user: creds.email.user, pass: creds.email.pass },
  });
  return transporter.sendMail({ from: creds.email.from, to, subject, html });
}

/**
 * Dispara uma mensagem pra uma lista de leads (todos, ou uma lista de IDs específica).
 * body: { channel: 'whatsapp'|'email', message: string, subject?: string, leadIds?: number[] }
 */
router.post('/send', async (req, res) => {
  const { channel, message, subject, leadIds } = req.body;
  if (!channel || !message) return res.status(400).json({ error: 'Informe o canal e a mensagem.' });

  try {
    const creds = await getTenantCredentials(req.tenantId);
    if (!creds) return res.status(400).json({ error: 'Configure as credenciais dessa marca antes de disparar.' });

    let leadsQuery;
    if (Array.isArray(leadIds) && leadIds.length) {
      leadsQuery = await pool.query(
        `SELECT * FROM leads WHERE tenant_id = $1 AND id = ANY($2::int[])`,
        [req.tenantId, leadIds]
      );
    } else {
      leadsQuery = await pool.query(`SELECT * FROM leads WHERE tenant_id = $1`, [req.tenantId]);
    }
    const leads = leadsQuery.rows;

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const lead of leads) {
      try {
        if (channel === 'whatsapp') {
          if (!lead.phone || !lead.opt_in_whatsapp) continue;
          await sendWhatsappText(creds, lead.phone, message.replace('{{nome}}', lead.name || ''));
        } else if (channel === 'email') {
          if (!lead.email || !lead.opt_in_email) continue;
          await sendCampaignEmail(creds, lead.email, subject || 'Novidades', message.replace('{{nome}}', lead.name || ''));
        }
        sent++;
        await pool.query(
          `INSERT INTO flow_logs (tenant_id, lead_id, order_id, flow_type, channel, status)
           VALUES ($1, $2, NULL, 'campanha_manual', $3, 'sent')`,
          [req.tenantId, lead.id, channel]
        );
      } catch (err) {
        failed++;
        errors.push({ leadId: lead.id, error: err.message });
      }
    }

    res.json({ success: true, totalLeads: leads.length, sent, failed, errors: errors.slice(0, 10) });
  } catch (err) {
    console.error('[Campaigns] Erro ao disparar:', err);
    res.status(500).json({ error: err.message || 'Erro ao disparar campanha.' });
  }
});

module.exports = router;
