const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { hashPassword, verifyPassword, signSession, setSessionCookie, clearSessionCookie, requireAuth } = require('../utils/auth');

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Cria uma nova marca (tenant) + o primeiro usuário admin dela */
router.post('/register', async (req, res) => {
  const { brandName, name, email, password } = req.body;
  if (!brandName || !email || !password) {
    return res.status(400).json({ error: 'Preencha nome da marca, e-mail e senha.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let slug = slugify(brandName);
    const existingSlug = await client.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (existingSlug.rows.length) slug = `${slug}-${Date.now().toString(36)}`;

    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING *`,
      [brandName, slug]
    );
    const tenant = tenantResult.rows[0];

    const passwordHash = await hashPassword(password);
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'admin') RETURNING id, tenant_id, email, name, role`,
      [tenant.id, email.toLowerCase().trim(), passwordHash, name || null]
    );
    const user = userResult.rows[0];

    await client.query(`INSERT INTO tenant_credentials (tenant_id) VALUES ($1)`, [tenant.id]);

    await client.query('COMMIT');

    const token = signSession({ userId: user.id, tenantId: tenant.id, role: user.role });
    setSessionCookie(res, token);
    res.json({ success: true, tenant, user });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
    }
    console.error('[Auth] Erro no registro:', err);
    res.status(500).json({ error: 'Erro ao criar conta. Tente novamente.' });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Preencha e-mail e senha.' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });

    const tenantResult = await pool.query('SELECT * FROM tenants WHERE id = $1', [user.tenant_id]);
    const tenant = tenantResult.rows[0];

    const token = signSession({ userId: user.id, tenantId: user.tenant_id, role: user.role });
    setSessionCookie(res, token);
    res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role }, tenant });
  } catch (err) {
    console.error('[Auth] Erro no login:', err);
    res.status(500).json({ error: 'Erro ao entrar. Tente novamente.' });
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [req.userId]);
    const tenantResult = await pool.query('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
    res.json({ user: userResult.rows[0], tenant: tenantResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar sessão.' });
  }
});

module.exports = router;
