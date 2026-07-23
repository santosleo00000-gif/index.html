const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon/Supabase exigem SSL; em Postgres local isso é ignorado sem problema.
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 5, // funções serverless são de curta duração, mantenha o pool pequeno
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool do Postgres:', err);
});

module.exports = pool;
