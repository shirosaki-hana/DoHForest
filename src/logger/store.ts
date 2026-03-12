import { LRUCache } from 'lru-cache';
import { env } from '../config/env.js';
import { LOG_LEVELS, LOG_CATEGORIES, type LogLevel, type LogCategory, type LogItem, type GetLogsRequest } from './types.js';
//------------------------------------------------------------------------------//

interface LogEntry {
  id: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  meta: string | null;
  createdAt: Date;
}

class LogStore {
  private cache: LRUCache<number, LogEntry>;
  private nextId = 1;

  constructor(maxLogs: number) {
    this.cache = new LRUCache<number, LogEntry>({ max: maxLogs });
  }

  push(level: LogLevel, category: LogCategory, message: string, meta?: unknown): void {
    const id = this.nextId++;
    this.cache.set(id, {
      id,
      level,
      category,
      message,
      meta: meta !== undefined ? JSON.stringify(meta) : null,
      createdAt: new Date(),
    });
  }

  query(params: GetLogsRequest): {
    logs: LogItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  } {
    const { level, levels, category, categories, search, startDate, endDate, page = 1, limit = 50, sortOrder = 'desc' } = params;

    const searchLower = search?.toLowerCase();
    const startTs = startDate ? new Date(startDate) : null;
    const endTs = endDate ? new Date(endDate) : null;

    const filtered: LogEntry[] = [];

    this.cache.rforEach((entry) => {
      if (levels && levels.length > 0) {
        if (!levels.includes(entry.level)) {
          return;
        }
      } else if (level && entry.level !== level) {
        return;
      }

      if (categories && categories.length > 0) {
        if (!categories.includes(entry.category)) {
          return;
        }
      } else if (category && entry.category !== category) {
        return;
      }

      if (searchLower && !entry.message.toLowerCase().includes(searchLower)) {
        return;
      }

      if (startTs && entry.createdAt < startTs) {
        return;
      }
      if (endTs && entry.createdAt > endTs) {
        return;
      }

      filtered.push(entry);
    });

    const total = filtered.length;
    const sorted = sortOrder === 'asc' ? filtered : filtered.reverse();

    const offset = (page - 1) * limit;
    const paged = sorted.slice(offset, offset + limit);

    return {
      logs: paged.map((e) => ({
        id: e.id,
        level: e.level,
        category: e.category,
        message: e.message,
        meta: e.meta,
        createdAt: e.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  getStats(): {
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
    last24h: number;
    last7d: number;
  } {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const byLevel: Record<string, number> = {};
    for (const lvl of LOG_LEVELS) {
      byLevel[lvl] = 0;
    }

    const byCategory: Record<string, number> = {};
    for (const cat of LOG_CATEGORIES) {
      byCategory[cat] = 0;
    }

    let last24h = 0;
    let last7d = 0;

    this.cache.forEach((entry) => {
      byLevel[entry.level]++;
      byCategory[entry.category]++;
      const ts = entry.createdAt.getTime();
      if (ts >= oneDayAgo) {
        last24h++;
      }
      if (ts >= oneWeekAgo) {
        last7d++;
      }
    });

    return {
      total: this.cache.size,
      byLevel,
      byCategory,
      last24h,
      last7d,
    };
  }
}

export const logStore = new LogStore(env.LOG_MAX_COUNT);
