const cron = require('node-cron');
const pool = require('../db/pool');
const whatsapp = require('../integrations/whatsapp');
const email = require('../integrations/email');
const flows = require('../flows/engine');

/**
 * Roda uma vez: reenvia lembrete de PIX pra pedidos pendentes há mais de 3h
 * e que ainda não receberam um segundo lembrete nas últimas 3h.
 */
async function runPixReminders() {
  const result = await pool.query(`
    SELECT o.*, l.name, l.phone, l.email, l.opt_in_whatsapp, l.opt_in_email, l.id as lead_id
    FROM orders o
    JOIN leads l ON l.id = o.lead_id
    WHERE o.payment_status = 'pending'
      AND o.created_at < now() - interval '3 hours'
      AND NOT EXISTS (
        SELECT 1 FROM flow_logs f
        WHERE f.order_id = o.id AND f.flow_type = 'pix_reminder'
          AND f.sent_at > now() - interval '3 hours'
      )
  `);

  for (const row of result.rows) {
    const lead = { id: row.lead_id, name: row.name, phone: row.phone, email: row.email, opt_in_whatsapp: row.opt_in_whatsapp, opt_in_email: row.opt_in_email };
    const payload = {
      customerName: lead.name,
      orderNumber: row.order_number,
      amount: row.total_amount,
      pixCopyPaste: row.pix_qr_code,
    };

    if (lead.opt_in_whatsapp && lead.phone && row.pix_qr_code) {
      await whatsapp.sendPixReminder(lead.phone, payload);
    }
    if (lead.opt_in_email && lead.email && row.pix_qr_code) {
      const { subject, html } = email.pixReminderEmail(payload);
      await email.sendEmail({ to: lead.email, subject, html });
    }
  }
  return result.rows.length;
}

/**
 * Roda uma vez: consulta status de rastreio dos pedidos fulfilled ainda não entregues.
 */
async function runTrackingChecks() {
  const result = await pool.query(`
    SELECT o.*, l.name, l.phone, l.email, l.opt_in_whatsapp, l.opt_in_email, l.id as lead_id
    FROM orders o
    JOIN leads l ON l.id = o.lead_id
    WHERE o.fulfillment_status = 'fulfilled'
      AND o.tracking_status != 'delivered'
      AND o.tracking_code IS NOT NULL
  `);

  let updated = 0;
  for (const row of result.rows) {
    const newStatus = await checkTrackingStatus(row.tracking_code, row.tracking_carrier);
    if (newStatus && newStatus.status !== row.tracking_status) {
      await pool.query(`UPDATE orders SET tracking_status = $1, updated_at = now() WHERE id = $2`, [
        newStatus.status,
        row.id,
      ]);
      const lead = { id: row.lead_id, name: row.name, phone: row.phone, email: row.email, opt_in_whatsapp: row.opt_in_whatsapp, opt_in_email: row.opt_in_email };
      await flows.triggerTrackingFlow({ ...row, tracking_status: newStatus.status }, lead, newStatus.statusText);
      updated++;
    }
  }
  return updated;
}

/**
 * STUB - substitua pela integração real com o provedor de rastreio escolhido
 * (Correios, AfterShip, 17Track). Retornar null se não houve mudança.
 */
async function checkTrackingStatus(trackingCode, carrier) {
  // TODO: implementar chamada real.
  return null;
}

/** Usado só em ambiente local/VPS com processo contínuo (npm run dev / npm start) */
function startAllJobs() {
  cron.schedule('0 * * * *', () => runPixReminders().catch((err) => console.error('[Scheduler] Erro PIX:', err)));
  cron.schedule('0 */2 * * *', () => runTrackingChecks().catch((err) => console.error('[Scheduler] Erro rastreio:', err)));
  console.log('[Scheduler] Jobs agendados (node-cron) iniciados.');
}

module.exports = { startAllJobs, runPixReminders, runTrackingChecks };
