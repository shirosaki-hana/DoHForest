import { env } from '../config/env.js';
import { logger } from '../logger/index.js';
import { database } from '../database/index.js';
//------------------------------------------------------------------------------//

/**
 * 캐시에서 DNS 응답 조회
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

  const entry = await database.dnsCache.lookup(domain.toLowerCase(), queryType);
  if (!entry) {
    return null;
  }

  const response = Buffer.from(entry.responseData);
  response.writeUInt16BE(transactionId, 0);
  return response;
}

/**
 * DNS 응답을 캐시에 저장
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
 */
export async function purgeExpiredCache(): Promise<number> {
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
