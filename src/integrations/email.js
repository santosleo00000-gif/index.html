const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('[Email] Ignorando envio - SMTP ainda não configurado.');
    return null;
  }
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });
}

function pixReminderEmail({ customerName, orderNumber, amount, pixCopyPaste }) {
  return {
    subject: `Seu pagamento do pedido ${orderNumber} está pendente`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2>Oi, ${customerName}!</h2>
        <p>Notamos que o pagamento do seu pedido <strong>${orderNumber}</strong> (R$ ${amount}) ainda está pendente.</p>
        <p>Copie o código abaixo e cole no app do seu banco para pagar via PIX:</p>
        <code style="display:block; background:#f4f4f4; padding:12px; word-break:break-all;">${pixCopyPaste}</code>
        <p>Qualquer dúvida, é só responder este e-mail ou chamar a gente no WhatsApp.</p>
      </div>
    `,
  };
}

function trackingUpdateEmail({ customerName, orderNumber, trackingCode, statusText }) {
  return {
    subject: `Seu pedido ${orderNumber} está a caminho!`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2>Oi, ${customerName}!</h2>
        <p>Atualização do seu pedido <strong>${orderNumber}</strong>:</p>
        <p><strong>${statusText}</strong></p>
        <p>Código de rastreio: <code>${trackingCode}</code></p>
      </div>
    `,
  };
}

module.exports = { sendEmail, pixReminderEmail, trackingUpdateEmail };
