import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import {
  getCacheStatsResult,
  getCacheSummary,
  flushCache,
  type CacheSummaryInput,
} from '../services/cacheService.js';
//------------------------------------------------------------------------------//

function parseIntParam(value: unknown): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// GET /api/cache/stats
async function cacheStatsHandler(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const stats = getCacheStatsResult();
  return reply.send({ success: true, stats });
}

// GET /api/cache/summary
async function cacheSummaryHandler(
  request: FastifyRequest<{
    Querystring: Record<string, string | undefined>;
  }>,
  reply: FastifyReply
) {
  const q = request.query;

  const input: CacheSummaryInput = {
    page: parseIntParam(q.page),
    limit: parseIntParam(q.limit),
    search: q.search || undefined,
    status: q.status as CacheSummaryInput['status'],
  };

  const result = getCacheSummary(input);
  return reply.send({ success: true, ...result });
}

// POST /api/cache/flush
async function cacheFlushHandler(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const result = flushCache();
  return reply.send({ success: true, ...result });
}

// --- Route registration ---

export async function registerCacheRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onError', async (_request, reply, error) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: 'Validation Error',
        details: error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      });
    }
  });

  app.get('/api/cache/stats', cacheStatsHandler);
  app.get('/api/cache/summary', cacheSummaryHandler);
  app.post('/api/cache/flush', cacheFlushHandler);
}
