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

  // ECS(Client Subnet) 옵션이 있으면 제거 후 업스트림에 전달
  const forwardBuffer = stripClientSubnet(query, queryBuffer);

  // DoH 업스트림 질의
  const result = await resolveViaDoH(forwardBuffer);
  if (!result) {
    logger.warn('dns', `${domain} ${queryType}`, {
      result: 'servfail',
      ms: Date.now() - startTime,
    });
    return buildServFailResponse(queryBuffer);
  }

  // 응답 검증 및 캐싱
  try {
    const rcode = result.responseBuffer.length >= 4 ? result.responseBuffer[3]! & 0x0f : 2;
    const response = dnsPacket.decode(result.responseBuffer);

    // Question 섹션 불일치 시 캐싱 스킵 (업스트림 오동작 방어)
    const respQuestion = response.questions?.[0];
    if (respQuestion?.name?.toLowerCase() !== domain.toLowerCase() || respQuestion?.type !== queryType) {
      logger.warn('dns', `${domain} ${queryType}`, {
        result: 'response_question_mismatch',
        provider: result.provider.name,
        ms: Date.now() - startTime,
      });
      return result.responseBuffer;
    }

    // NOERROR(0), NXDOMAIN(3)만 캐싱 — SERVFAIL, REFUSED 등은 캐싱하지 않음
    if (rcode === 0 || rcode === 3) {
      const answers = (response.answers ?? []) as Array<{ ttl?: number }>;
      const minTtl = extractMinTtl(answers);
      cacheStore(domain, queryType, result.responseBuffer, minTtl, result.provider.url);
    }
  } catch {
    // 검증/캐싱 실패는 non-fatal — 쿼리 자체는 성공
  }

  logger.info('dns', `${domain} ${queryType}`, {
    result: 'resolved',
    provider: result.provider.name,
    ms: Date.now() - startTime,
  });

  return result.responseBuffer;
}

const ECS_OPTION_CODE = 8; // RFC 7871 EDNS Client Subnet

/**
 * EDNS0 Client Subnet 옵션을 제거하여 클라이언트 네트워크 정보가
 * DoH 업스트림에 불필요하게 노출되는 것을 방지
 *
 * ECS가 없으면 원본 버퍼를 그대로 반환 (재인코딩 없음)
 */
function stripClientSubnet(query: dnsPacket.Packet, originalBuffer: Buffer): Buffer {
  const additionals = query.additionals;
  if (!additionals) {
    return originalBuffer;
  }

  let hasEcs = false;
  for (const rr of additionals) {
    if (rr.type === 'OPT') {
      const opt = rr as dnsPacket.OptAnswer;
      if (opt.options.some((o) => o.code === ECS_OPTION_CODE)) {
        hasEcs = true;
        break;
      }
    }
  }

  if (!hasEcs) {
    return originalBuffer;
  }

  for (const rr of additionals) {
    if (rr.type === 'OPT') {
      const opt = rr as dnsPacket.OptAnswer;
      opt.options = opt.options.filter((o) => o.code !== ECS_OPTION_CODE);
    }
  }

  try {
    return dnsPacket.encode(query);
  } catch {
    return originalBuffer;
  }
}
