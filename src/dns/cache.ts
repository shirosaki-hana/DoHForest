import { LRUCache } from 'lru-cache';
import { env } from '../config/env.js';
//------------------------------------------------------------------------------//

interface MemoryCacheEntry {
  responseData: Buffer;
  expiresAt: number;
  ttl: number;
  upstream: string;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
}

export interface CacheConfig {
  enabled: boolean;
  minTtl: number;
  maxTtl: number;
  maxItems: number;
}

export interface CacheStatsResult {
  stats: CacheStats;
  config: CacheConfig;
}

export interface CacheEntry {
  domain: string;
  queryType: string;
  ttl: number;
  upstream: string;
  expiresAt: number;
  status: 'active' | 'expired';
}

export interface ListEntriesResult {
  entries: CacheEntry[];
  total: number;
}

const memoryCache = new LRUCache<string, MemoryCacheEntry>({
  max: env.CACHE_MAX_ITEMS,
});

let hits = 0;
let misses = 0;

function cacheKey(domain: string, queryType: string): string {
  return `${domain}|${queryType}`;
}

function parseCacheKey(key: string): { domain: string; queryType: string } {
  const sep = key.indexOf('|');
  return { domain: key.slice(0, sep), queryType: key.slice(sep + 1) };
}

/**
 * 캐시에서 DNS 응답 조회
 * HIT 시 transaction ID(처음 2바이트)를 요청의 것으로 교체하여 반환
 */
export function cacheLookup(domain: string, queryType: string, transactionId: number): Buffer | null {
  if (!env.CACHE_ENABLED) {
    return null;
  }

  const key = cacheKey(domain.toLowerCase(), queryType);

  const mem = memoryCache.get(key);
  if (mem) {
    if (mem.expiresAt > Date.now()) {
      hits++;
      const response = Buffer.from(mem.responseData);
      response.writeUInt16BE(transactionId, 0);
      return response;
    }
    memoryCache.delete(key);
  }
  misses++;

  return null;
}

/**
 * DNS 응답을 캐시에 저장
 * 응답 Answer 섹션의 최소 TTL을 기준으로 환경변수 범위 내 클램핑
 */
export function cacheStore(domain: string, queryType: string, responseBuffer: Buffer, rawTtl: number, upstream: string): void {
  if (!env.CACHE_ENABLED) {
    return;
  }

  const ttl = clampTtl(rawTtl);
  if (ttl <= 0) {
    return;
  }

  const key = cacheKey(domain.toLowerCase(), queryType);
  const ttlMs = ttl * 1000;
  const expiresAt = Date.now() + ttlMs;

  memoryCache.set(key, { responseData: responseBuffer, expiresAt, ttl, upstream }, { ttl: ttlMs });
}

/**
 * TTL 클램핑: CACHE_MIN_TTL <= ttl <= CACHE_MAX_TTL
 */
function clampTtl(ttl: number): number {
  return Math.max(env.CACHE_MIN_TTL, Math.min(env.CACHE_MAX_TTL, ttl));
}

/**
 * 만료된 캐시 정리 (주기적 호출용)
 */
export function purgeExpiredCache(): number {
  const before = memoryCache.size;
  memoryCache.purgeStale();

  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }

  const purged = before - memoryCache.size;
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

function hitRate(h: number, m: number): number {
  const total = h + m;
  if (total === 0) {
    return 0;
  }
  return Math.round((h / total) * 10000) / 100;
}

/**
 * 캐시 통계 반환
 */
export function getCacheStats(): CacheStatsResult {
  return {
    stats: {
      size: memoryCache.size,
      maxSize: env.CACHE_MAX_ITEMS,
      hitCount: hits,
      missCount: misses,
      hitRate: hitRate(hits, misses),
    },
    config: {
      enabled: env.CACHE_ENABLED,
      minTtl: env.CACHE_MIN_TTL,
      maxTtl: env.CACHE_MAX_TTL,
      maxItems: env.CACHE_MAX_ITEMS,
    },
  };
}

/**
 * 메모리 캐시 엔트리 목록 조회 (검색, 상태 필터, 페이지네이션)
 */
export function listMemoryEntries(params: {
  page: number;
  limit: number;
  search?: string;
  status?: 'active' | 'expired' | 'all';
}): ListEntriesResult {
  const now = Date.now();
  const filtered: CacheEntry[] = [];

  for (const [key, entry] of memoryCache.entries()) {
    const { domain, queryType } = parseCacheKey(key);
    const status: 'active' | 'expired' = entry.expiresAt > now ? 'active' : 'expired';

    if (params.search && !domain.includes(params.search.toLowerCase())) {
      continue;
    }
    if (params.status && params.status !== 'all' && status !== params.status) {
      continue;
    }

    filtered.push({
      domain,
      queryType,
      ttl: entry.ttl,
      upstream: entry.upstream,
      expiresAt: entry.expiresAt,
      status,
    });
  }

  const total = filtered.length;
  const offset = (params.page - 1) * params.limit;
  const entries = filtered.slice(offset, offset + params.limit);

  return { entries, total };
}

/**
 * 메모리 캐시 플러시, 삭제된 엔트리 수 반환
 */
export function flushCache(): number {
  const size = memoryCache.size;
  memoryCache.clear();
  return size;
}

/**
 * 히트/미스 카운터 리셋
 */
export function resetCacheCounters(): void {
  hits = 0;
  misses = 0;
}
