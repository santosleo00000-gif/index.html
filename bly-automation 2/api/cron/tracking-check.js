require('dotenv').config();
const { runTrackingChecks } = require('../../src/jobs/scheduler');

module.exports = async (req, res) => {
  const auth = req.headers['authorization'];
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const count = await runTrackingChecks();
    res.status(200).json({ success: true, orders_updated: count });
  } catch (err) {
    console.error('[Cron] Erro em tracking-check:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
