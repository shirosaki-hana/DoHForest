import Fastify from 'fastify';
import staticFiles from '@fastify/static';

import { env } from './config/env.js';
import { fastifyConfig, staticFilesConfig } from './config/server.js';
import { errorHandler } from './handlers/errorHandler.js';
import { notFoundHandler } from './handlers/notFoundHandler.js';
import { logger, console_error, console_log } from './logger/index.js';
import { initializeDatabase } from './database/index.js';
import { disconnectDatabase } from './database/connection.js';
import { initializeLogger } from './logger/logs.js';
import { startDnsServer, stopDnsServer } from './dns/server.js';
//------------------------------------------------------------------------------//

// Fastify 서버 생성
async function createFastifyApp() {
  const fastify = Fastify(fastifyConfig);
  await fastify.register(staticFiles, staticFilesConfig);
  fastify.setNotFoundHandler(notFoundHandler);
  fastify.setErrorHandler(errorHandler);
  return fastify;
}

// 서버 시작 함수
async function startServer(host: string, port: number) {
  await initializeDatabase();
  await initializeLogger();

  const fastify = await createFastifyApp();
  await fastify.listen({ port, host });
  logger.info('server', 'Server started successfully', {
    host,
    port,
    url: `http://${host}:${port}`,
    staticConfig: staticFilesConfig,
  });
  console_log(`[server] Server is running on http://${host}:${port}`);

  await startDnsServer();

  return fastify;
}

let isShuttingDown = false;

async function gracefulShutdown(
  fastify: Awaited<ReturnType<typeof createFastifyApp>>,
  signal: string
) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console_log(`[server] Graceful shutdown initiated (signal: ${signal})`);
  try {
    await stopDnsServer();
    await fastify.close();
    disconnectDatabase();
    console_log('[server] Graceful shutdown completed');
    process.exitCode = 0;
  } catch (error) {
    console_error('[server] Graceful shutdown failed', error);
    process.exitCode = 1;
  }
}

async function main() {
  try {
    const fastify = await startServer(env.WEBUI_HOST, env.WEBUI_PORT);
    process.on('SIGINT', () =>
      gracefulShutdown(fastify, 'SIGINT').catch(console_error)
    );
    process.on('SIGTERM', () =>
      gracefulShutdown(fastify, 'SIGTERM').catch(console_error)
    );
  } catch (error) {
    console_error(error);
    process.exitCode = 1;
  }
}

main();
