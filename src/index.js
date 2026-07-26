require('dotenv').config();
const app = require('./app');
const { startAllJobs } = require('./jobs/scheduler');
const { runMigrations } = require('./db/migrate');

const PORT = process.env.PORT || 3000;

async function start() {
  await runMigrations(); // cria as tabelas automaticamente, se ainda não existirem
  app.listen(PORT, () => {
    console.log(`[Server] BLY! Automation rodando na porta ${PORT}`);
    startAllJobs();
  });
}

start().catch((err) => {
  console.error('[Server] Falha ao iniciar:', err);
  process.exit(1);
});
