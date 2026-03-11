import dnsPacket from 'dns-packet';
import { logger } from '../logger/index.js';
import { cacheLookup, cacheStore, extractMinTtl } from './cache.js';
import { resolveViaDoH, buildServFailResponse } from '../doh/client.js';
//------------------------------------------------------------------------------//

/**
 * DNS 요청 처리 파이프라인
 *
 * 1. dns-packet으로 디코딩
 * 2. 캐시 조회 (HIT → transaction ID 교체 후 즉시 반환)
 * 3. 캐시 MISS → DoH 업스트림 질의 (failover 포함)
 * 4. 응답 캐싱 후 반환
 * 5. 전체 실패 시 SERVFAIL 반환
 */
export async function handleDnsQuery(queryBuffer: Buffer): Promise<Buffer> {
  let query: dnsPacket.Packet;
  try {
    query = dnsPacket.decode(queryBuffer);
  } catch (error) {
    logger.warn('dns', 'Failed to decode DNS query', {
      error: error instanceof Error ? error.message : String(error),
      bufferLength: queryBuffer.length,
    });
    return buildServFailResponse(queryBuffer);
  }

  const question = query.questions?.[0];
  if (!question?.name || !question.type) {
    logger.warn('dns', 'DNS query has no question section', {
      id: query.id,
    });
    return buildServFailResponse(queryBuffer);
  }

  const domain = question.name;
  const queryType = question.type;
  const transactionId = query.id ?? 0;

  // 캐시 조회
  const cached = await cacheLookup(domain, queryType, transactionId);
  if (cached) {
    logger.debug('dns', 'Serving from cache', { domain, type: queryType });
    return cached;
  }

  // DoH 업스트림 질의
  const result = await resolveViaDoH(queryBuffer);
  if (!result) {
    logger.error('dns', 'All upstream providers failed', {
      domain,
      type: queryType,
    });
    return buildServFailResponse(queryBuffer);
  }

  // 응답 파싱하여 TTL 추출 및 캐싱
  try {
    const response = dnsPacket.decode(result.responseBuffer);
    const answers = (response.answers ?? []) as Array<{ ttl?: number }>;
    const minTtl = extractMinTtl(answers);

    await cacheStore(
      domain,
      queryType,
      result.responseBuffer,
      minTtl,
      result.provider.url
    );
  } catch (error) {
    logger.warn('dns', 'Failed to cache DNS response (non-fatal)', {
      domain,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.debug('dns', 'Resolved via DoH', {
    domain,
    type: queryType,
    provider: result.provider.name,
  });

  return result.responseBuffer;
}
