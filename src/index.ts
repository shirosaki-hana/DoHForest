import Fastify from 'fastify';
import staticFiles from '@fastify/static';

import { env } from './config/env.js';
import { fastifyConfig, staticFilesConfig } from './config/server.js';
import { errorHandler } from './handlers/errorHandler.js';
import { notFoundHandler } from './handlers/notFoundHandler.js';
import { logger } from './utils/log.js';
//------------------------------------------------------------------------------//

// Fastify 서버 생성
async function createFastifyApp() {
  const fastify = Fastify(fastifyConfig);
  await fastify.register(staticFiles, staticFilesConfig); // 정적 파일 서빙
  //핸들러 등록
  fastify.setNotFoundHandler(notFoundHandler); // SPA fallback 및 404 핸들러
  fastify.setErrorHandler(errorHandler); // 전역 에러 핸들러
  return fastify;
}

// 서버 시작 함수
async function startServer(host: string, port: number) {
  const fastify = await createFastifyApp();
  await fastify.listen({ port, host: host }); // 5. 서버 리스닝 시작
  logger.info('Server started successfully', {
    host,
    port,
    url: `http://${host}:${port}`,
    staticConfig: staticFilesConfig,
  });
  return fastify;
}

// Graceful shutdown 상태 플래그 (중복 호출 방지)
let isShuttingDown = false;

// Graceful shutdown 핸들러
async function gracefulShutdown(
  fastify: Awaited<ReturnType<typeof createFastifyApp>>,
  signal: string
) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  logger.info(`Graceful shutdown initiated (signal: ${signal})`);
  try {
    await fastify.close();
    logger.info('Graceful shutdown completed');
    process.exitCode = 0;
  } catch (error) {
    logger.error('Graceful shutdown failed', error);
    process.exitCode = 1;
  }
}

// 메인 엔트리 포인트
async function main() {
  try {
    const fastify = await startServer(env.HOST, env.PORT);
    process.on('SIGINT', () =>
      gracefulShutdown(fastify, 'SIGINT').catch(logger.error)
    );
    process.on('SIGTERM', () =>
      gracefulShutdown(fastify, 'SIGTERM').catch(logger.error)
    );
  } catch (error) {
    logger.error(error);
    process.exitCode = 1;
  }
}

// 서버 시작
main();
