import { eq, and, lte, gt, like, count } from 'drizzle-orm';
import type { Database } from '../connection.js';
import { queryRawSql } from '../connection.js';
import { dnsCache } from '../schema.js';
//------------------------------------------------------------------------------//

export class DnsCacheRepository {
  constructor(private db: Database) {}

  /**
   * 캐시 조회 (domain + queryType, 만료되지 않은 것만)
   */
  async lookup(
    domain: string,
    queryType: string
  ): Promise<{ responseData: Buffer; ttl: number; expiresAt: number } | null> {
    const now = Date.now();
    const rows = await this.db
      .select({
        responseData: dnsCache.responseData,
        ttl: dnsCache.ttl,
        expiresAt: dnsCache.expiresAt,
      })
      .from(dnsCache)
      .where(
        and(
          eq(dnsCache.domain, domain),
          eq(dnsCache.queryType, queryType),
          gt(dnsCache.expiresAt, now)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      responseData: row.responseData,
      ttl: row.ttl,
      expiresAt: row.expiresAt,
    };
  }

  /**
   * 캐시 저장 (UPSERT - domain+queryType 기준)
   */
  async upsert(
    domain: string,
    queryType: string,
    responseData: Buffer,
    ttl: number,
    upstream: string
  ): Promise<void> {
    const now = Date.now();
    const expiresAt = now + ttl * 1000;

    await this.db
      .insert(dnsCache)
      .values({
        domain,
        queryType,
        responseData,
        ttl,
        expiresAt,
        upstream,
        createdAt: new Date(now),
      })
      .onConflictDoUpdate({
        target: [dnsCache.domain, dnsCache.queryType],
        set: {
          responseData,
          ttl,
          expiresAt,
          upstream,
          createdAt: new Date(now),
        },
      });
  }

  /**
   * 만료된 캐시 엔트리 삭제
   */
  async purgeExpired(): Promise<number> {
    const now = Date.now();
    await this.db.delete(dnsCache).where(lte(dnsCache.expiresAt, now));
    return (
      queryRawSql<{ changes: number }>('SELECT changes() as changes')
        ?.changes ?? 0
    );
  }

  /**
   * 전체 캐시 삭제
   */
  async flush(): Promise<number> {
    await this.db.delete(dnsCache);
    return (
      queryRawSql<{ changes: number }>('SELECT changes() as changes')
        ?.changes ?? 0
    );
  }

  /**
   * 캐시 통계
   */
  async getStats(): Promise<{ total: number; expired: number }> {
    const now = Date.now();

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(dnsCache);
    const total = totalResult?.count ?? 0;

    const [expiredResult] = await this.db
      .select({ count: count() })
      .from(dnsCache)
      .where(lte(dnsCache.expiresAt, now));
    const expired = expiredResult?.count ?? 0;

    return { total, expired };
  }

  /**
   * 캐시 엔트리 목록 조회 (responseData 제외, 페이지네이션/검색/상태 필터)
   */
  async listEntries(params: {
    page: number;
    limit: number;
    search?: string;
    status?: 'active' | 'expired' | 'all';
  }): Promise<{
    entries: Array<{
      domain: string;
      queryType: string;
      ttl: number;
      upstream: string;
      expiresAt: number;
      createdAt: Date;
      status: 'active' | 'expired';
    }>;
    total: number;
  }> {
    const now = Date.now();
    const offset = (params.page - 1) * params.limit;

    const conditions = [];
    if (params.search) {
      conditions.push(like(dnsCache.domain, `%${params.search}%`));
    }
    if (params.status === 'active') {
      conditions.push(gt(dnsCache.expiresAt, now));
    } else if (params.status === 'expired') {
      conditions.push(lte(dnsCache.expiresAt, now));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ count: count() })
      .from(dnsCache)
      .where(where);
    const total = countResult?.count ?? 0;

    const rows = await this.db
      .select({
        domain: dnsCache.domain,
        queryType: dnsCache.queryType,
        ttl: dnsCache.ttl,
        upstream: dnsCache.upstream,
        expiresAt: dnsCache.expiresAt,
        createdAt: dnsCache.createdAt,
      })
      .from(dnsCache)
      .where(where)
      .limit(params.limit)
      .offset(offset);

    const entries = rows.map((row) => ({
      ...row,
      status: (row.expiresAt > now ? 'active' : 'expired') as
        | 'active'
        | 'expired',
    }));

    return { entries, total };
  }
}
