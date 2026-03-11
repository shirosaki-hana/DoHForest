-- DNS Cache 테이블 (DoH 응답 캐시)
CREATE TABLE IF NOT EXISTS dns_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  query_type TEXT NOT NULL,
  response_data BLOB NOT NULL,
  ttl INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  upstream TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS dns_cache_lookup_idx
  ON dns_cache(domain, query_type);
CREATE INDEX IF NOT EXISTS dns_cache_expires_idx
  ON dns_cache(expires_at);
