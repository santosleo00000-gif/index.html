const axios = require('axios');
const FormData = require('form-data');

/**
 * Transcreve um áudio (buffer) recebido do WhatsApp usando uma API de STT
 * (ex: OpenAI Whisper). Troque o endpoint/campo se usar outro provedor.
 */
async function transcribeAudio(buffer, mimeType = 'audio/ogg') {
  const form = new FormData();
  form.append('file', buffer, { filename: 'audio.ogg', contentType: mimeType });
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  const response = await axios.post(process.env.TRANSCRIPTION_ENDPOINT, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${process.env.TRANSCRIPTION_API_KEY}`,
    },
  });

  return response.data.text;
}

/**
 * Classifica a intenção da mensagem do lead usando Claude, e gera uma resposta
 * curta e natural. Retorna { intent, reply }.
 *
 * intent possíveis: "rastreio" | "pagamento" | "duvida_produto" | "outro"
 */
async function classifyAndReply({ message, context }) {
  const systemPrompt = `Você é o atendimento virtual da BLY!, uma marca de joias personalizadas
(correntes e pingentes). Sua tarefa é:
1. Classificar a intenção da mensagem do cliente em uma das categorias: rastreio, pagamento, duvida_produto, outro.
2. Gerar uma resposta curta, calorosa e natural em português do Brasil (2-4 frases), usando o contexto do pedido se disponível.

Contexto do cliente:
${JSON.stringify(context, null, 2)}

Responda APENAS em JSON no formato exato: {"intent": "...", "reply": "..."}
Não inclua nenhum texto antes ou depois do JSON.`;

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  );

  const rawText = response.data.content.map((block) => block.text || '').join('');
  const cleaned = rawText.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[AI] Falha ao parsear resposta da IA:', rawText);
    return { intent: 'outro', reply: 'Desculpa, não entendi muito bem. Pode reformular?' };
  }
}

module.exports = { transcribeAudio, classifyAndReply };
