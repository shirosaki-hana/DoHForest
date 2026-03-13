import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { env } from './config/env.js';
import { fastifyConfig, staticFilesConfig } from './config/webui.js';
import { errorHandler } from './handlers/errorHandler.js';
import { notFoundHandler } from './handlers/notFoundHandler.js';
import { registerApiRoutes } from './api/index.js';
import { console_error, console_log } from './logger/console.js';
import { startDnsServer, stopDnsServer } from './dns/server.js';
import { destroyUpstreamPool } from './doh/providers.js';
import { startScheduler, stopScheduler } from './scheduler/index.js';
//------------------------------------------------------------------------------//

async function createWebUI() {
  const app = Fastify(fastifyConfig);
  await app.register(staticFiles, staticFilesConfig);
  await registerApiRoutes(app);
  app.setNotFoundHandler(notFoundHandler);
  app.setErrorHandler(errorHandler);
  return app;
}

function onTerminationSignal(): Promise<string> {
  return new Promise((resolve) => {
    process.once('SIGINT', () => resolve('SIGINT'));
    process.once('SIGTERM', () => resolve('SIGTERM'));
  });
}

async function main() {
  // Startup
  const webui = await createWebUI();
  await webui.listen({ port: env.WEBUI_PORT, host: env.WEBUI_HOST });
  console_log(`WebUI is running on http://${env.WEBUI_HOST}:${env.WEBUI_PORT}`);

  await startDnsServer();
  startScheduler();

  // Await termination
  const signal = await onTerminationSignal();

  // Shutdown
  console_log(`Graceful shutdown initiated (signal: ${signal})`);
  try {
    stopScheduler();
    destroyUpstreamPool();
    await stopDnsServer();
    await webui.close();
    console_log('Graceful shutdown completed');
  } catch (error) {
    console_error('Graceful shutdown failed', error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console_error(error);
  process.exitCode = 1;
});
