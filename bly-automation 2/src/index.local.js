require('dotenv').config();
const app = require('./app');
const { startAllJobs } = require('./jobs/scheduler');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] BLY! Automation rodando na porta ${PORT} (modo local)`);
  startAllJobs(); // node-cron só funciona em processo contínuo (uso local / VPS)
});
