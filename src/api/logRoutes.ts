import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import {
  queryLogs,
  getLogStats,
  getLogMeta,
  deleteLogs,
  cleanupLogs,
  type QueryLogsInput,
  type DeleteLogsInput,
  type CleanupLogsInput,
} from '../services/logService.js';
//------------------------------------------------------------------------------//

function formatZodError(error: ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
}

function parseCommaSeparated(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || value === '') {
    return undefined;
  }
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseIntParam(value: unknown): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// GET /api/logs
async function getLogsHandler(
  request: FastifyRequest<{
    Querystring: Record<string, string | undefined>;
  }>,
  reply: FastifyReply,
) {
  const q = request.query;

  const input: QueryLogsInput = {
    level: q.level as QueryLogsInput['level'],
    levels: parseCommaSeparated(q.levels) as QueryLogsInput['levels'],
    category: q.category as QueryLogsInput['category'],
    categories: parseCommaSeparated(q.categories) as QueryLogsInput['categories'],
    search: q.search || undefined,
    startDate: q.startDate || undefined,
    endDate: q.endDate || undefined,
    page: parseIntParam(q.page),
    limit: parseIntParam(q.limit),
    sortOrder: q.sortOrder as QueryLogsInput['sortOrder'],
  };

  const result = await queryLogs(input);
  return reply.send({ success: true, ...result });
}

// GET /api/logs/stats
async function getStatsHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const stats = await getLogStats();
  return reply.send({ success: true, stats });
}

// GET /api/logs/meta
async function getMetaHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const meta = getLogMeta();
  return reply.send({ success: true, ...meta });
}

// DELETE /api/logs
async function deleteLogsHandler(
  request: FastifyRequest<{ Body: DeleteLogsInput }>,
  reply: FastifyReply,
) {
  const result = await deleteLogs(request.body);
  return reply.send({ success: true, ...result });
}

// POST /api/logs/cleanup
async function cleanupLogsHandler(
  request: FastifyRequest<{ Body: CleanupLogsInput }>,
  reply: FastifyReply,
) {
  const result = await cleanupLogs(request.body ?? {});
  return reply.send({ success: true, ...result });
}

// --- Route registration ---

export async function registerLogRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onError', async (_request, reply, error) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: 'Validation Error',
        details: formatZodError(error),
      });
    }
  });

  app.get('/api/logs', getLogsHandler);
  app.get('/api/logs/stats', getStatsHandler);
  app.get('/api/logs/meta', getMetaHandler);
  app.delete('/api/logs', deleteLogsHandler);
  app.post('/api/logs/cleanup', cleanupLogsHandler);
}
