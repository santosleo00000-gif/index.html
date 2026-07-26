const pool = require('../db/pool');
const whatsapp = require('../integrations/whatsapp');
const email = require('../integrations/email');
const mercadopago = require('../integrations/mercadopago');

async function logFlow({ leadId, orderId, flowType, channel, status = 'sent', errorMessage = null }) {
  await pool.query(
    `INSERT INTO flow_logs (lead_id, order_id, flow_type, channel, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [leadId, orderId, flowType, channel, status, errorMessage]
  );
}

/**
 * Fluxo: pedido novo com pagamento pendente -> gera PIX e envia por WhatsApp + e-mail.
 */
async function triggerPixFlow(order, lead) {
  const charge = await mercadopago.createPixCharge({
    orderId: order.id,
    amount: order.total_amount,
    description: `Pedido ${order.order_number} - BLY!`,
    payerEmail: lead.email,
  });

  if (!charge) {
    console.warn(`[Flows] PIX não gerado para pedido ${order.order_number} - Mercado Pago ainda não configurado.`);
    return;
  }

  await pool.query(
    `UPDATE orders SET pix_charge_id = $1, pix_qr_code = $2, pix_qr_code_base64 = $3, pix_expires_at = $4
     WHERE id = $5`,
    [charge.chargeId, charge.qrCode, charge.qrCodeBase64, charge.expiresAt, order.id]
  );

  const payload = {
    customerName: lead.name,
    orderNumber: order.order_number,
    amount: order.total_amount,
    pixCopyPaste: charge.qrCode,
  };

  try {
    if (lead.opt_in_whatsapp && lead.phone) {
      await whatsapp.sendPixReminder(lead.phone, payload);
      await whatsapp.sendText(lead.phone, charge.qrCode); // envia o copia-e-cola em seguida
      await logFlow({ leadId: lead.id, orderId: order.id, flowType: 'pix_reminder', channel: 'whatsapp' });
    }
  } catch (err) {
    await logFlow({ leadId: lead.id, orderId: order.id, flowType: 'pix_reminder', channel: 'whatsapp', status: 'failed', errorMessage: err.message });
  }

  try {
    if (lead.opt_in_email && lead.email) {
      const { subject, html } = email.pixReminderEmail(payload);
      await email.sendEmail({ to: lead.email, subject, html });
      await logFlow({ leadId: lead.id, orderId: order.id, flowType: 'pix_reminder', channel: 'email' });
    }
  } catch (err) {
    await logFlow({ leadId: lead.id, orderId: order.id, flowType: 'pix_reminder', channel: 'email', status: 'failed', errorMessage: err.message });
  }
}

/**
 * Fluxo: pedido com rastreio atualizado -> notifica o lead.
 */
async function triggerTrackingFlow(order, lead, statusText) {
  const payload = {
    customerName: lead.name,
    orderNumber: order.order_number,
    trackingCode: order.tracking_code,
    statusText,
  };

  try {
    if (lead.opt_in_whatsapp && lead.phone) {
      await whatsapp.sendTrackingUpdate(lead.phone, payload);
      await logFlow({ leadId: lead.id, orderId: order.id, flowType: 'tracking_update', channel: 'whatsapp' });
    }
  } catch (err) {
    await logFlow({ leadId: lead.id, orderId: order.id, flowType: 'tracking_update', channel: 'whatsapp', status: 'failed', errorMessage: err.message });
  }

  try {
    if (lead.opt_in_email && lead.email) {
      const { subject, html } = email.trackingUpdateEmail(payload);
      await email.sendEmail({ to: lead.email, subject, html });
      await logFlow({ leadId: lead.id, orderId: order.id, flowType: 'tracking_update', channel: 'email' });
    }
  } catch (err) {
    await logFlow({ leadId: lead.id, orderId: order.id, flowType: 'tracking_update', channel: 'email', status: 'failed', errorMessage: err.message });
  }
}

/**
 * Fluxo: resposta do chatbot IA para uma mensagem recebida (texto ou áudio transcrito).
 */
async function triggerChatbotReply(lead, replyText, channel = 'whatsapp') {
  try {
    if (channel === 'whatsapp' && lead.phone) {
      await whatsapp.sendText(lead.phone, replyText);
    } else if (channel === 'email' && lead.email) {
      await email.sendEmail({ to: lead.email, subject: 'BLY! - Atendimento', html: `<p>${replyText}</p>` });
    }
    await logFlow({ leadId: lead.id, orderId: null, flowType: 'chatbot_reply', channel });
  } catch (err) {
    await logFlow({ leadId: lead.id, orderId: null, flowType: 'chatbot_reply', channel, status: 'failed', errorMessage: err.message });
  }
}

module.exports = { triggerPixFlow, triggerTrackingFlow, triggerChatbotReply };
