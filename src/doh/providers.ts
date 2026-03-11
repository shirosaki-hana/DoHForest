import { env } from '../config/env.js';
import { logger } from '../logger/index.js';
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
 */
export async function queryUpstream(
  dnsWireBuffer: Buffer
): Promise<DoHQueryResult | null> {
  const result = await queryProvider(primary, dnsWireBuffer);
  if (result) {
    return result;
  }

  logger.warn('dns', 'Primary DoH provider failed, trying secondary', {
    primary: primary.url,
    secondary: secondary.url,
  });

  const fallback = await queryProvider(secondary, dnsWireBuffer);
  if (fallback) {
    return fallback;
  }

  logger.error('dns', 'All DoH providers failed');
  return null;
}

/**
 * 개별 프로바이더에 DoH POST 질의 (RFC 8484)
 */
async function queryProvider(
  provider: DoHProvider,
  dnsWireBuffer: Buffer
): Promise<DoHQueryResult | null> {
  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/dns-message',
        Accept: 'application/dns-message',
      },
      body: dnsWireBuffer,
      signal: AbortSignal.timeout(env.DOH_TIMEOUT),
    });

    if (!response.ok) {
      logger.warn(
        'dns',
        `DoH provider ${provider.name} returned HTTP ${response.status}`,
        {
          provider: provider.url,
          status: response.status,
        }
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const responseBuffer = Buffer.from(arrayBuffer);

    return { responseBuffer, provider };
  } catch (error) {
    logger.warn('dns', `DoH provider ${provider.name} request failed`, {
      provider: provider.url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
