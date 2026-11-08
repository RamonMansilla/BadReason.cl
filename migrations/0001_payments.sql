CREATE TABLE IF NOT EXISTS payment_orders (
 id TEXT PRIMARY KEY, quote TEXT NOT NULL, provider TEXT, provider_id TEXT,
 redirect TEXT, status TEXT NOT NULL DEFAULT 'quoted', receipt TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_id ON payment_orders(provider,provider_id);
