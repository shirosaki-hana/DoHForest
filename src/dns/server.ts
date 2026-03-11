import { env } from '../config/env.js';
import { logger, console_log } from '../logger/index.js';
import { startUdpServer, stopUdpServer } from './udpServer.js';
import { startTcpServer, stopTcpServer } from './tcpServer.js';
import { purgeExpiredCache } from './cache.js';
//------------------------------------------------------------------------------//

const CACHE_PURGE_INTERVAL_MS = 5 * 60 * 1000; // 5분

let purgeTimer: ReturnType<typeof setInterval> | null = null;

/**
 * DNS 서버 시작 (UDP + TCP 동시)
 */
export async function startDnsServer(): Promise<void> {
  const { DNS_HOST, DNS_PORT } = env;

  await Promise.all([
    startUdpServer(DNS_HOST, DNS_PORT),
    startTcpServer(DNS_HOST, DNS_PORT),
  ]);

  // 주기적 캐시 만료 정리
  if (env.CACHE_ENABLED) {
    purgeTimer = setInterval(() => {
      purgeExpiredCache().catch((err) => {
        logger.warn('dns', 'Cache purge failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, CACHE_PURGE_INTERVAL_MS);
  }

  logger.info('dns', 'DNS server started', {
    host: DNS_HOST,
    port: DNS_PORT,
    protocols: ['UDP', 'TCP'],
    cacheEnabled: env.CACHE_ENABLED,
  });
  console_log(
    `[dns] DNS server listening on ${DNS_HOST}:${DNS_PORT} (UDP+TCP)`
  );
}

/**
 * DNS 서버 종료 (UDP + TCP)
 */
export async function stopDnsServer(): Promise<void> {
  if (purgeTimer) {
    clearInterval(purgeTimer);
    purgeTimer = null;
  }

  await Promise.all([stopUdpServer(), stopTcpServer()]);

  logger.info('dns', 'DNS server stopped');
  console_log('[dns] DNS server stopped');
}
