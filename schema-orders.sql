-- Run once:  npx wrangler d1 execute asl-db --remote --file=schema-orders.sql
CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  plan         TEXT NOT NULL,            -- 1m | 3m | 12m
  amount_micro INTEGER NOT NULL,         -- USDT x 1,000,000 (unique per open order)
  status       TEXT NOT NULL,            -- pending | paid | expired | review
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  tx_id        TEXT,
  paid_at      INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_open_amount ON orders(amount_micro) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, status);
CREATE TABLE IF NOT EXISTS seen_tx (
  tx_id        TEXT PRIMARY KEY,
  amount_micro INTEGER,
  from_addr    TEXT,
  block_ts     INTEGER,
  result       TEXT,                     -- processing | paid:<order> | review:<order> | unmatched
  created_at   INTEGER
);
