import { startDnsServer, stopDnsServer } from '../dns/server.js';
import { destroyUpstreamPool } from '../doh/providers.js';
//------------------------------------------------------------------------------//

export async function setup() {
  await startDnsServer();
}

export async function teardown() {
  destroyUpstreamPool();
  await stopDnsServer();
}
