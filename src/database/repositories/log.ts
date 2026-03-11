import {
  eq,
  inArray,
  and,
  gte,
  lte,
  like,
  desc,
  asc,
  count,
} from 'drizzle-orm';
import type { Database } from '../connection.js';
import { logs } from '../schema.js';
import {
  LOG_LEVELS,
  LOG_CATEGORIES,
  type LogLevel,
  type LogCategory,
  type GetLogsRequest,
} from '../../logger/types.js';
//------------------------------------------------------------------------------//

export class LogRepository {
  constructor(private db: Database) {}

  /**
   * 로그 생성
   * @param timestamp - 로그 발생 시점 (큐에서 flush될 때 원래 시간 유지용)
   */
  async create(
    level: LogLevel,
    category: LogCategory,
    message: string,
    meta?: unknown,
    timestamp?: Date
  ): Promise<void> {
    await this.db.insert(logs).values({
      level,
      category,
      message,
      meta: meta ? JSON.stringify(meta) : null,
      createdAt: timestamp ?? new Date(),
    });
  }

  /**
   * 로그 조회 (페이지네이션 + 필터)
   */
  async findMany(params: GetLogsRequest): Promise<{
    logs: {
      id: number;
      level: string;
      category: string;
      message: string;
      meta: string | null;
      createdAt: string;
    }[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const {
      level,
      levels,
      category,
      categories,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      sortOrder = 'desc',
    } = params;

    // WHERE 조건 구성
    const conditions = [];

    // 레벨 필터
    if (levels && levels.length > 0) {
      conditions.push(inArray(logs.level, levels));
    } else if (level) {
      conditions.push(eq(logs.level, level));
    }

    // 카테고리 필터
    if (categories && categories.length > 0) {
      conditions.push(inArray(logs.category, categories));
    } else if (category) {
      conditions.push(eq(logs.category, category));
    }

    // 검색어 필터
    if (search) {
      conditions.push(like(logs.message, `%${search}%`));
    }

    // 기간 필터
    if (startDate) {
      conditions.push(gte(logs.createdAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(logs.createdAt, new Date(endDate)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 총 개수 조회
    const [countResult] = await this.db
      .select({ count: count() })
      .from(logs)
      .where(whereClause);
    const total = countResult?.count ?? 0;

    // 데이터 조회
    const orderByClause =
      sortOrder === 'desc' ? desc(logs.createdAt) : asc(logs.createdAt);
    const offset = (page - 1) * limit;

    const rows = await this.db
      .select()
      .from(logs)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    return {
      logs: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 로그 통계
   */
  async getStats(): Promise<{
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
    last24h: number;
    last7d: number;
  }> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 전체 개수
    const [totalResult] = await this.db.select({ count: count() }).from(logs);
    const total = totalResult?.count ?? 0;

    // 레벨별 통계
    const byLevelRows = await this.db
      .select({ level: logs.level, count: count() })
      .from(logs)
      .groupBy(logs.level);

    // 카테고리별 통계
    const byCategoryRows = await this.db
      .select({ category: logs.category, count: count() })
      .from(logs)
      .groupBy(logs.category);

    // 최근 24시간
    const [last24hResult] = await this.db
      .select({ count: count() })
      .from(logs)
      .where(gte(logs.createdAt, oneDayAgo));
    const last24h = last24hResult?.count ?? 0;

    // 최근 7일
    const [last7dResult] = await this.db
      .select({ count: count() })
      .from(logs)
      .where(gte(logs.createdAt, oneWeekAgo));
    const last7d = last7dResult?.count ?? 0;

    const ALL_LEVELS = LOG_LEVELS;
    const ALL_CATEGORIES = LOG_CATEGORIES;

    const byLevel: Record<string, number> = {};
    for (const lvl of ALL_LEVELS) {
      byLevel[lvl] = 0;
    }
    for (const row of byLevelRows) {
      byLevel[row.level] = row.count;
    }

    const byCategory: Record<string, number> = {};
    for (const cat of ALL_CATEGORIES) {
      byCategory[cat] = 0;
    }
    for (const row of byCategoryRows) {
      byCategory[row.category] = row.count;
    }

    return { total, byLevel, byCategory, last24h, last7d };
  }

  /**
   * 로그 삭제 (ID 목록)
   */
  async deleteByIds(ids: number[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }
    await this.db.delete(logs).where(inArray(logs.id, ids));
    return ids.length; // SQLite proxy는 changes를 직접 반환하지 않음
  }

  /**
   * 조건 기반 로그 삭제
   */
  async deleteByCondition(params: {
    olderThan?: string;
    level?: LogLevel;
  }): Promise<number> {
    const { olderThan, level } = params;
    const conditions = [];

    if (olderThan) {
      conditions.push(lte(logs.createdAt, new Date(olderThan)));
    }
    if (level) {
      conditions.push(eq(logs.level, level));
    }

    if (conditions.length === 0) {
      return 0;
    }

    // 먼저 삭제할 개수 조회
    const [countResult] = await this.db
      .select({ count: count() })
      .from(logs)
      .where(and(...conditions));
    const deleteCount = countResult?.count ?? 0;

    await this.db.delete(logs).where(and(...conditions));
    return deleteCount;
  }

  /**
   * 보관 기간 초과 로그 삭제
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const [countResult] = await this.db
      .select({ count: count() })
      .from(logs)
      .where(lte(logs.createdAt, date));
    const deleteCount = countResult?.count ?? 0;

    await this.db.delete(logs).where(lte(logs.createdAt, date));
    return deleteCount;
  }

  /**
   * 총 로그 개수 조회
   */
  async count(): Promise<number> {
    const [result] = await this.db.select({ count: count() }).from(logs);
    return result?.count ?? 0;
  }

  /**
   * 가장 오래된 로그 ID 조회
   */
  async getOldestIds(limit: number): Promise<number[]> {
    const rows = await this.db
      .select({ id: logs.id })
      .from(logs)
      .orderBy(asc(logs.createdAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }
}
