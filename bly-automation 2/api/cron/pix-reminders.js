require('dotenv').config();
const { runPixReminders } = require('../../src/jobs/scheduler');

module.exports = async (req, res) => {
  // Se usar Vercel Cron, a própria Vercel injeta esse header com CRON_SECRET.
  // Se usar um cron externo (cron-job.org etc), configure-o pra mandar esse header também.
  const auth = req.headers['authorization'];
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const count = await runPixReminders();
    res.status(200).json({ success: true, reminders_sent: count });
  } catch (err) {
    console.error('[Cron] Erro em pix-reminders:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
