-- ============================================
-- BLY! Automation - Schema do banco de dados
-- ============================================

CREATE TABLE IF NOT EXISTS leads (
  id                SERIAL PRIMARY KEY,
  shopify_customer_id TEXT UNIQUE,
  name              TEXT,
  phone             TEXT,        -- formato E.164, ex: 5511999998888
  email             TEXT,
  opt_in_whatsapp   BOOLEAN DEFAULT true,
  opt_in_email      BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id                SERIAL PRIMARY KEY,
  shopify_order_id  TEXT UNIQUE NOT NULL,
  lead_id           INTEGER REFERENCES leads(id),
  order_number      TEXT,
  total_amount      NUMERIC(10,2),
  currency          TEXT DEFAULT 'BRL',
  payment_status    TEXT DEFAULT 'pending',   -- pending | paid | cancelled | refunded
  fulfillment_status TEXT DEFAULT 'unfulfilled', -- unfulfilled | fulfilled | partial
  tracking_code     TEXT,
  tracking_carrier  TEXT,
  tracking_status   TEXT,                     -- posted | in_transit | out_for_delivery | delivered | exception
  pix_charge_id     TEXT,                     -- id da cobranca no Mercado Pago
  pix_qr_code       TEXT,
  pix_qr_code_base64 TEXT,
  pix_expires_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id                SERIAL PRIMARY KEY,
  lead_id           INTEGER REFERENCES leads(id),
  channel           TEXT NOT NULL,     -- whatsapp | email
  direction         TEXT NOT NULL,     -- inbound | outbound
  message_type      TEXT DEFAULT 'text', -- text | audio | template | image
  content           TEXT,              -- texto (ou transcricao, se for audio)
  raw_media_url     TEXT,
  intent            TEXT,              -- classificado pela IA: rastreio | pagamento | duvida | outro
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flow_logs (
  id                SERIAL PRIMARY KEY,
  lead_id           INTEGER REFERENCES leads(id),
  order_id          INTEGER REFERENCES orders(id),
  flow_type         TEXT NOT NULL,    -- pix_reminder | tracking_update | order_confirmation | chatbot_reply
  channel           TEXT NOT NULL,    -- whatsapp | email
  status            TEXT DEFAULT 'sent', -- sent | failed
  error_message     TEXT,
  sent_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);
