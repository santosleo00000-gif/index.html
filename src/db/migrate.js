const fs = require('fs');
const path = require('path');
const pool = require('./pool');

/** Aplica o schema.sql (idempotente - seguro rodar toda vez que o servidor liga) */
async function runMigrations() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('[DB] Verificando/criando tabelas...');
  await pool.query(schema);
  console.log('[DB] Tabelas prontas.');
}

// Permite rodar manualmente também: node src/db/migrate.js
if (require.main === module) {
  require('dotenv').config();
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migrate] Falhou:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
