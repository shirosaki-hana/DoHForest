import { initializeDatabase } from '../database/index.js';
import { disconnectDatabase } from '../database/connection.js';
import { initializeLogger } from '../logger/service.js';
import { startDnsServer, stopDnsServer } from '../dns/server.js';

export async function setup() {
  await initializeDatabase();
  await initializeLogger();
  await startDnsServer();
}

export async function teardown() {
  await stopDnsServer();
  disconnectDatabase();
}
