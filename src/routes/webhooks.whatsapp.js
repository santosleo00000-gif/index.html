const express = require('express');
const router = express.Router();
const whatsapp = require('../integrations/whatsapp');
const ai = require('../integrations/ai');
const flows = require('../flows/engine');
const pool = require('../db/pool');
const { normalizePhone } = require('../integrations/shopify');

// Verificação inicial do webhook (feita uma vez, ao configurar no Meta Developer Portal)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Recebimento de mensagens (texto e áudio)
router.post('/', async (req, res) => {
  const signature = req.get('X-Hub-Signature-256');
  if (!whatsapp.verifyWebhookSignature(req.body, signature)) {
    return res.status(401).send('Assinatura inválida');
  }

  res.status(200).send('ok'); // responde rápido, processa depois

  try {
    const payload = JSON.parse(req.body.toString('utf8'));
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message) return; // pode ser um evento de status (entregue/lido), ignoramos

    const fromPhone = normalizePhone(message.from);
    let lead = await findOrCreateLeadByPhone(fromPhone);

    let messageText = '';
    let messageType = 'text';
    let mediaUrl = null;

    if (message.type === 'text') {
      messageText = message.text.body;
    } else if (message.type === 'audio') {
      messageType = 'audio';
      const { buffer, mimeType } = await whatsapp.downloadMedia(message.audio.id);
      messageText = await ai.transcribeAudio(buffer, mimeType);
    } else {
      messageText = '[mensagem de tipo não suportado]';
    }

    // Busca contexto do pedido mais recente do lead pra dar contexto à IA
    const orderResult = await pool.query(
      `SELECT * FROM orders WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [lead.id]
    );
    const latestOrder = orderResult.rows[0] || null;

    await pool.query(
      `INSERT INTO conversations (lead_id, channel, direction, message_type, content, raw_media_url)
       VALUES ($1, 'whatsapp', 'inbound', $2, $3, $4)`,
      [lead.id, messageType, messageText, mediaUrl]
    );

    const { intent, reply } = await ai.classifyAndReply({
      message: messageText,
      context: latestOrder
        ? {
            pedido: latestOrder.order_number,
            status_pagamento: latestOrder.payment_status,
            status_entrega: latestOrder.fulfillment_status,
            rastreio: latestOrder.tracking_code,
          }
        : { info: 'Nenhum pedido encontrado para esse cliente ainda.' },
    });

    await pool.query(
      `UPDATE conversations SET intent = $1 WHERE lead_id = $2 AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1`,
      [intent, lead.id]
    );

    await flows.triggerChatbotReply(lead, reply, 'whatsapp');
  } catch (err) {
    console.error('[Webhook WhatsApp] Erro processando mensagem:', err);
  }
});

async function findOrCreateLeadByPhone(phone) {
  const existing = await pool.query(`SELECT * FROM leads WHERE phone = $1`, [phone]);
  if (existing.rows[0]) return existing.rows[0];

  const created = await pool.query(
    `INSERT INTO leads (phone, name) VALUES ($1, $2) RETURNING *`,
    [phone, 'Cliente WhatsApp']
  );
  return created.rows[0];
}

module.exports = router;
