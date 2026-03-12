import dnsPacket from 'dns-packet';
import { logger } from '../logger/index.js';
import { cacheLookup, cacheStore, extractMinTtl } from './cache.js';
import { resolveViaDoH, buildServFailResponse } from '../doh/client.js';
//------------------------------------------------------------------------------//

/**
 * DNS 요청 처리 파이프라인 (1 query = 1 log)
 *
 * 1. dns-packet으로 디코딩
 * 2. 캐시 조회 (HIT → transaction ID 교체 후 즉시 반환)
 * 3. 캐시 MISS → DoH 업스트림 질의 (failover 포함)
 * 4. 응답 캐싱 후 반환
 * 5. 전체 실패 시 SERVFAIL 반환
 */
export async function handleDnsQuery(queryBuffer: Buffer): Promise<Buffer> {
  const startTime = Date.now();

  let query: dnsPacket.Packet;
  try {
    query = dnsPacket.decode(queryBuffer);
  } catch (error) {
    logger.warn('dns', 'Query failed', {
      result: 'decode_error',
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - startTime,
    });
    return buildServFailResponse(queryBuffer);
  }

  const question = query.questions?.[0];
  if (!question?.name || !question.type) {
    logger.warn('dns', 'Query failed', {
      result: 'invalid_query',
      id: query.id,
      ms: Date.now() - startTime,
    });
    return buildServFailResponse(queryBuffer);
  }

  const domain = question.name;
  const queryType = question.type;
  const transactionId = query.id ?? 0;

  // 캐시 조회
  const cached = cacheLookup(domain, queryType, transactionId);
  if (cached) {
    logger.info('dns', `${domain} ${queryType}`, {
      result: 'cache_hit',
      ms: Date.now() - startTime,
    });
    return cached;
  }

  // DoH 업스트림 질의
  const result = await resolveViaDoH(queryBuffer);
  if (!result) {
    logger.warn('dns', `${domain} ${queryType}`, {
      result: 'servfail',
      ms: Date.now() - startTime,
    });
    return buildServFailResponse(queryBuffer);
  }

  // 응답 파싱하여 TTL 추출 및 캐싱
  try {
    const response = dnsPacket.decode(result.responseBuffer);
    const answers = (response.answers ?? []) as Array<{ ttl?: number }>;
    const minTtl = extractMinTtl(answers);
    cacheStore(domain, queryType, result.responseBuffer, minTtl, result.provider.url);
  } catch {
    // 캐싱 실패는 non-fatal — 쿼리 자체는 성공
  }

  logger.info('dns', `${domain} ${queryType}`, {
    result: 'resolved',
    provider: result.provider.name,
    ms: Date.now() - startTime,
  });

  return result.responseBuffer;
}
