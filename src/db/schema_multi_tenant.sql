-- ============================================
-- BLY! Automation - Multi-marca (tenants)
-- Roda depois do schema.sql original. Idempotente.
-- ============================================

CREATE TABLE IF NOT EXISTS tenants (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,       -- usado na URL dos webhooks (ex: bly, marca-2)
  theme_color TEXT DEFAULT '#C9A15A',     -- cor de destaque do painel dessa marca
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT,
  role          TEXT DEFAULT 'admin',     -- admin | member
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Credenciais de cada integração, isoladas por marca. Valores sensíveis ficam
-- criptografados (ver src/utils/crypto.js) antes de serem salvos aqui.
CREATE TABLE IF NOT EXISTS tenant_credentials (
  tenant_id                 INTEGER PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_store_domain      TEXT,
  shopify_admin_api_token   TEXT,   -- criptografado
  shopify_webhook_secret    TEXT,   -- criptografado
  whatsapp_phone_number_id  TEXT,
  whatsapp_access_token     TEXT,   -- criptografado
  whatsapp_verify_token     TEXT,
  whatsapp_app_secret       TEXT,   -- criptografado
  mp_access_token           TEXT,   -- criptografado
  mp_webhook_secret         TEXT,   -- criptografado
  smtp_host                 TEXT,
  smtp_port                 INTEGER DEFAULT 465,
  smtp_user                 TEXT,
  smtp_pass                 TEXT,   -- criptografado
  email_from                TEXT,
  anthropic_api_key         TEXT,   -- criptografado
  transcription_api_key     TEXT,   -- criptografado
  updated_at                TIMESTAMPTZ DEFAULT now()
);

-- ==== Migração dos dados existentes (single-tenant) pra uma marca "padrão" ====
INSERT INTO tenants (name, slug)
  VALUES ('BLY!', 'bly')
  ON CONFLICT (slug) DO NOTHING;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE flow_logs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);

UPDATE leads SET tenant_id = (SELECT id FROM tenants WHERE slug = 'bly') WHERE tenant_id IS NULL;
UPDATE orders SET tenant_id = (SELECT id FROM tenants WHERE slug = 'bly') WHERE tenant_id IS NULL;
UPDATE conversations SET tenant_id = (SELECT id FROM tenants WHERE slug = 'bly') WHERE tenant_id IS NULL;
UPDATE flow_logs SET tenant_id = (SELECT id FROM tenants WHERE slug = 'bly') WHERE tenant_id IS NULL;

-- Troca a unicidade global por unicidade "dentro da marca" (2 marcas podem ter
-- clientes Shopify com o mesmo ID interno, já que são lojas diferentes).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_shopify_customer_id_key') THEN
    ALTER TABLE leads DROP CONSTRAINT leads_shopify_customer_id_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_tenant_shopify_customer_unique') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_tenant_shopify_customer_unique UNIQUE (tenant_id, shopify_customer_id);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_shopify_order_id_key') THEN
    ALTER TABLE orders DROP CONSTRAINT orders_shopify_order_id_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_tenant_shopify_order_unique') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_tenant_shopify_order_unique UNIQUE (tenant_id, shopify_order_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
