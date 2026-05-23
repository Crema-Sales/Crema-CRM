-- Outbound CRM webhooks (stretch goal). Org admins register subscriptions
-- pointing at a generic JSON receiver or a Slack incoming webhook; emit()
-- fan-out signs the body with HMAC-SHA256 and POSTs once per delivery,
-- logging every attempt to webhook_deliveries for the settings UI.

CREATE TABLE webhook_subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'json'
    CHECK (format IN ('json', 'slack')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_delivery_at TEXT,
  last_status INTEGER
);
CREATE INDEX idx_webhook_subs_org ON webhook_subscriptions(org_id);
CREATE INDEX idx_webhook_subs_org_enabled ON webhook_subscriptions(org_id, enabled);

CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status INTEGER,
  response_snippet TEXT,
  duration_ms INTEGER,
  succeeded INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_webhook_deliveries_sub_time
  ON webhook_deliveries(subscription_id, attempted_at DESC);
CREATE INDEX idx_webhook_deliveries_org_time
  ON webhook_deliveries(org_id, attempted_at DESC);
