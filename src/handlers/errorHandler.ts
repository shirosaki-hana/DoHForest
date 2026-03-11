import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/log.js';

/**
 * 전역 에러 핸들러
 */
export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error('Unhandled error:', error);
  const statusCode = error.statusCode || 500;
  return reply.code(statusCode).send({ error: error.stack });
}
