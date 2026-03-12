import { env } from '../config/env.js';
import { logger } from '../logger/index.js';
import { console_log } from '../logger/console.js';
import { startUdpServer, stopUdpServer } from './udpServer.js';
import { startTcpServer, stopTcpServer } from './tcpServer.js';
//------------------------------------------------------------------------------//

/**
 * DNS 서버 시작 (UDP + TCP 동시)
 */
export async function startDnsServer(): Promise<void> {
  const { DNS_HOST, DNS_PORT } = env;

  await Promise.all([
    startUdpServer(DNS_HOST, DNS_PORT),
    startTcpServer(DNS_HOST, DNS_PORT),
  ]);

  logger.info('dns', 'DNS server started', {
    host: DNS_HOST,
    port: DNS_PORT,
    protocols: ['UDP', 'TCP'],
    cacheEnabled: env.CACHE_ENABLED,
  });
  console_log(`DNS server listening on ${DNS_HOST}:${DNS_PORT} (UDP+TCP)`);
}

/**
 * DNS 서버 종료 (UDP + TCP)
 */
export async function stopDnsServer(): Promise<void> {
  await Promise.all([stopUdpServer(), stopTcpServer()]);

  logger.info('dns', 'DNS server stopped');
  console_log('DNS server stopped');
}
