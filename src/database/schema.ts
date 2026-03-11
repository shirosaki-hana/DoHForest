import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
//------------------------------------------------------------------------------//
/**
 * Logs 테이블 - 시스템 로그
 */
export const logs = sqliteTable(
  'logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    level: text('level').notNull(), // ERROR, WARN, INFO, DEBUG
    category: text('category').notNull(), // api, auth, system, database, server
    message: text('message').notNull(),
    meta: text('meta'), // JSON 형태의 추가 데이터
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index('logs_level_idx').on(table.level),
    index('logs_category_idx').on(table.category),
    index('logs_created_at_idx').on(table.createdAt),
  ]
);

//------------------------------------------------------------------------------//
// 타입 추출
export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
