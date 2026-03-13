import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { performDnsLookup, DNS_RECORD_TYPES, type DnsLookupInput } from '../services/dnsTestService.js';
//------------------------------------------------------------------------------//

// POST /api/dns/lookup
async function dnsLookupHandler(request: FastifyRequest<{ Body: DnsLookupInput }>, reply: FastifyReply) {
  const result = await performDnsLookup(request.body);
  return reply.send({ success: true, ...result });
}

// GET /api/dns/meta
async function dnsMetaHandler(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send({
    success: true,
    recordTypes: DNS_RECORD_TYPES as readonly string[],
  });
}

// Route registration
export async function registerDnsTestRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onError', async (_request, reply, error) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: 'Validation Error',
        details: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
  });

  app.post('/api/dns/lookup', dnsLookupHandler);
  app.get('/api/dns/meta', dnsMetaHandler);
}
