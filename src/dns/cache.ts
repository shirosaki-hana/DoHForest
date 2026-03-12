import { LRUCache } from 'lru-cache';
import { env } from '../config/env.js';
import { logger } from '../logger/index.js';
import { database } from '../database/index.js';
//------------------------------------------------------------------------------//

interface MemoryCacheEntry {
  responseData: Buffer;
  expiresAt: number;
}

export interface L1CacheStats {
  size: number;
  maxSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
}

export interface L2CacheStats {
  total: number;
  active: number;
  expired: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
}

export interface CacheConfig {
  enabled: boolean;
  minTtl: number;
  maxTtl: number;
  maxItems: number;
  purgeIntervalMin: number;
}

export interface CacheStatsResult {
  l1: L1CacheStats;
  l2: L2CacheStats;
  config: CacheConfig;
}

// L1: 인메모리 LRU+TTL 캐시
const memoryCache = new LRUCache<string, MemoryCacheEntry>({
  max: env.CACHE_MAX_ITEMS,
});

// 히트/미스 카운터 (프로세스 메모리, 재시작 시 리셋)
let l1Hits = 0;
let l1Misses = 0;
let l2Hits = 0;
let l2Misses = 0;

function cacheKey(domain: string, queryType: string): string {
  return `${domain}|${queryType}`;
}

/**
 * 캐시에서 DNS 응답 조회 (L1 메모리 → L2 SQLite)
 * HIT 시 transaction ID(처음 2바이트)를 요청의 것으로 교체하여 반환
 */
export async function cacheLookup(
  domain: string,
  queryType: string,
  transactionId: number
): Promise<Buffer | null> {
  if (!env.CACHE_ENABLED) {
    return null;
  }

  const key = cacheKey(domain.toLowerCase(), queryType);

  // L1: 메모리 캐시
  const mem = memoryCache.get(key);
  if (mem) {
    if (mem.expiresAt > Date.now()) {
      l1Hits++;
      const response = Buffer.from(mem.responseData);
      response.writeUInt16BE(transactionId, 0);
      return response;
    }
    memoryCache.delete(key);
  }
  l1Misses++;

  // L2: SQLite (미스 시 메모리로 승격)
  const entry = await database.dnsCache.lookup(domain.toLowerCase(), queryType);
  if (!entry) {
    l2Misses++;
    return null;
  }
  l2Hits++;

  const remainingTtl = entry.expiresAt - Date.now();
  if (remainingTtl > 0) {
    memoryCache.set(
      key,
      { responseData: entry.responseData, expiresAt: entry.expiresAt },
      { ttl: remainingTtl }
    );
  }

  const response = Buffer.from(entry.responseData);
  response.writeUInt16BE(transactionId, 0);
  return response;
}

/**
 * DNS 응답을 캐시에 저장 (L1 + L2 write-through)
 * 응답 Answer 섹션의 최소 TTL을 기준으로 환경변수 범위 내 클램핑
 */
export async function cacheStore(
  domain: string,
  queryType: string,
  responseBuffer: Buffer,
  rawTtl: number,
  upstream: string
): Promise<void> {
  if (!env.CACHE_ENABLED) {
    return;
  }

  const ttl = clampTtl(rawTtl);
  const key = cacheKey(domain.toLowerCase(), queryType);
  const ttlMs = ttl * 1000;
  const expiresAt = Date.now() + ttlMs;

  // L1: 메모리
  memoryCache.set(
    key,
    { responseData: responseBuffer, expiresAt },
    { ttl: ttlMs }
  );

  // L2: SQLite
  await database.dnsCache.upsert(
    domain.toLowerCase(),
    queryType,
    responseBuffer,
    ttl,
    upstream
  );
}

/**
 * TTL 클램핑: CACHE_MIN_TTL <= ttl <= CACHE_MAX_TTL
 */
function clampTtl(ttl: number): number {
  return Math.max(env.CACHE_MIN_TTL, Math.min(env.CACHE_MAX_TTL, ttl));
}

/**
 * 만료된 캐시 정리 (주기적 호출용)
 * 메모리: lru-cache 내장 purgeStale / SQLite: DELETE expired rows
 */
export async function purgeExpiredCache(): Promise<number> {
  memoryCache.purgeStale();

  const purged = await database.dnsCache.purgeExpired();
  if (purged > 0) {
    logger.info('dns', `Purged ${purged} expired cache entries`);
  }
  return purged;
}

/**
 * dns-packet 응답에서 최소 TTL 추출
 */
export function extractMinTtl(answers: Array<{ ttl?: number }>): number {
  if (answers.length === 0) {
    return env.CACHE_MIN_TTL;
  }

  let minTtl = Infinity;
  for (const answer of answers) {
    if (typeof answer.ttl === 'number' && answer.ttl < minTtl) {
      minTtl = answer.ttl;
    }
  }

  return minTtl === Infinity ? env.CACHE_MIN_TTL : minTtl;
}

function hitRate(hits: number, misses: number): number {
  const total = hits + misses;
  if (total === 0) {
    return 0;
  }
  return Math.round((hits / total) * 10000) / 100;
}

/**
 * L1/L2 통합 캐시 통계 반환
 */
export async function getCacheStats(): Promise<CacheStatsResult> {
  const l2DbStats = await database.dnsCache.getStats();

  return {
    l1: {
      size: memoryCache.size,
      maxSize: env.CACHE_MAX_ITEMS,
      hitCount: l1Hits,
      missCount: l1Misses,
      hitRate: hitRate(l1Hits, l1Misses),
    },
    l2: {
      total: l2DbStats.total,
      active: l2DbStats.total - l2DbStats.expired,
      expired: l2DbStats.expired,
      hitCount: l2Hits,
      missCount: l2Misses,
      hitRate: hitRate(l2Hits, l2Misses),
    },
    config: {
      enabled: env.CACHE_ENABLED,
      minTtl: env.CACHE_MIN_TTL,
      maxTtl: env.CACHE_MAX_TTL,
      maxItems: env.CACHE_MAX_ITEMS,
      purgeIntervalMin: env.CACHE_PURGE_INTERVAL_MIN,
    },
  };
}

/**
 * L1 메모리 캐시 플러시, 삭제된 엔트리 수 반환
 */
export function flushL1Cache(): number {
  const size = memoryCache.size;
  memoryCache.clear();
  return size;
}

/**
 * 히트/미스 카운터 리셋
 */
export function resetCacheCounters(): void {
  l1Hits = 0;
  l1Misses = 0;
  l2Hits = 0;
  l2Misses = 0;
}
