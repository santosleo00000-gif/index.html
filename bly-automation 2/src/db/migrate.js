require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('[Migrate] Aplicando schema...');
  await pool.query(schema);
  console.log('[Migrate] Concluído com sucesso.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('[Migrate] Falhou:', err);
  process.exit(1);
});
