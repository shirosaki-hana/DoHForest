import type { FastifyInstance } from 'fastify';
import { registerLogRoutes } from './logRoutes.js';
import { registerDnsTestRoutes } from './dnsTestRoutes.js';
import { registerCacheRoutes } from './cacheRoutes.js';
//------------------------------------------------------------------------------//

/**
 * 모든 API 라우트를 Fastify 인스턴스에 등록
 */
export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerLogRoutes);
  await app.register(registerDnsTestRoutes);
  await app.register(registerCacheRoutes);
}
