import { z } from 'zod';
import {
  getCacheStats,
  flushCache as flushMemoryCache,
  resetCacheCounters,
  listMemoryEntries,
  type CacheStatsResult,
} from '../dns/cache.js';
import { logger } from '../logger/index.js';
//------------------------------------------------------------------------------//

// Stats
export function getCacheStatsResult(): CacheStatsResult {
  return getCacheStats();
}

// Summary
const cacheSummarySchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
  search: z.string().max(253).optional(),
  status: z.enum(['active', 'expired', 'all']).default('all'),
});

export type CacheSummaryInput = z.input<typeof cacheSummarySchema>;

export function getCacheSummary(input: CacheSummaryInput) {
  const params = cacheSummarySchema.parse(input);
  const { entries, total } = listMemoryEntries(params);

  return {
    entries,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
    },
  };
}

// Flush
export function flushCache() {
  const flushed = flushMemoryCache();
  resetCacheCounters();

  logger.info('dns', `Cache flushed: ${flushed} entries`);

  return { flushed };
}
