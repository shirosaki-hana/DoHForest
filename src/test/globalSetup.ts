import { startDnsServer, stopDnsServer } from '../dns/server.js';

export async function setup() {
  await startDnsServer();
}

export async function teardown() {
  await stopDnsServer();
}
