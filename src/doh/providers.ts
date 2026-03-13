import { env } from '../config/env.js';
import * as h2pool from './h2pool.js';
import type { DoHProvider, DoHQueryResult } from './types.js';
//------------------------------------------------------------------------------//

const primary: DoHProvider = {
  name: 'primary',
  url: env.DOH_PRIMARY,
};

const secondary: DoHProvider = {
  name: 'secondary',
  url: env.DOH_SECONDARY,
};

/**
 * DoH 업스트림에 DNS wire format 질의 (failover 포함)
 *
 * 1. Primary 시도
 * 2. Primary 실패 시 Secondary 시도
 * 3. 모두 실패 시 null 반환
 *
 * 개별 프로바이더 실패 로그는 남기지 않음 — handler에서 쿼리 단위로 통합 기록
 */
export async function queryUpstream(dnsWireBuffer: Buffer): Promise<DoHQueryResult | null> {
  const result = await queryProvider(primary, dnsWireBuffer);
  if (result) {
    return result;
  }

  const fallback = await queryProvider(secondary, dnsWireBuffer);
  if (fallback) {
    return fallback;
  }

  return null;
}

/**
 * 개별 프로바이더에 DoH POST 질의 (RFC 8484, HTTP/2)
 */
async function queryProvider(provider: DoHProvider, dnsWireBuffer: Buffer): Promise<DoHQueryResult | null> {
  const responseBuffer = await h2pool.request(provider.url, dnsWireBuffer, env.DOH_TIMEOUT);
  return responseBuffer ? { responseBuffer, provider } : null;
}

/**
 * HTTP/2 세션 풀 종료 (graceful shutdown용)
 */
export function destroyUpstreamPool(): void {
  h2pool.destroy();
}
