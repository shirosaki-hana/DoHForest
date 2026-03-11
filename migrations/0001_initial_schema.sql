-- Logs 테이블 (시스템 로그)
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  meta TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS logs_level_idx ON logs(level);
CREATE INDEX IF NOT EXISTS logs_category_idx ON logs(category);
CREATE INDEX IF NOT EXISTS logs_created_at_idx ON logs(created_at);