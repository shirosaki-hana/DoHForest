import { eq, and, lte, count } from 'drizzle-orm';
import type { Database } from '../connection.js';
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
        and(eq(dnsCache.domain, domain), eq(dnsCache.queryType, queryType))
      )
      .limit(1);

    const row = rows[0];
    if (!row || row.expiresAt <= now) {
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

    const [countResult] = await this.db
      .select({ count: count() })
      .from(dnsCache)
      .where(lte(dnsCache.expiresAt, now));
    const deleteCount = countResult?.count ?? 0;

    if (deleteCount > 0) {
      await this.db.delete(dnsCache).where(lte(dnsCache.expiresAt, now));
    }

    return deleteCount;
  }

  /**
   * 전체 캐시 삭제
   */
  async flush(): Promise<number> {
    const [countResult] = await this.db
      .select({ count: count() })
      .from(dnsCache);
    const total = countResult?.count ?? 0;

    if (total > 0) {
      await this.db.delete(dnsCache);
    }

    return total;
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
}
