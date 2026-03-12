import { z } from 'zod';
import { database } from '../database/index.js';
import {
  getCacheStats,
  flushL1Cache,
  resetCacheCounters,
  type CacheStatsResult,
} from '../dns/cache.js';
import { logger } from '../logger/index.js';
//------------------------------------------------------------------------------//

// --- Stats ---

export async function getCacheStatsResult(): Promise<CacheStatsResult> {
  return getCacheStats();
}

// --- Summary ---

const cacheSummarySchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
  search: z.string().max(253).optional(),
  status: z.enum(['active', 'expired', 'all']).default('all'),
});

export type CacheSummaryInput = z.input<typeof cacheSummarySchema>;

export async function getCacheSummary(input: CacheSummaryInput) {
  const params = cacheSummarySchema.parse(input);
  const { entries, total } = await database.dnsCache.listEntries(params);

  return {
    entries,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
    },
  };
}

// --- Flush ---

const cacheFlushSchema = z.object({
  target: z.enum(['all', 'l1', 'l2']).default('all'),
});

export type CacheFlushInput = z.input<typeof cacheFlushSchema>;

export async function flushCache(input: CacheFlushInput) {
  const { target } = cacheFlushSchema.parse(input);

  let l1Flushed = 0;
  let l2Flushed = 0;

  if (target === 'all' || target === 'l1') {
    l1Flushed = flushL1Cache();
  }
  if (target === 'all' || target === 'l2') {
    l2Flushed = await database.dnsCache.flush();
  }

  resetCacheCounters();

  logger.info(
    'dns',
    `Cache flushed (target=${target}): L1=${l1Flushed}, L2=${l2Flushed}`
  );

  return { flushed: { l1: l1Flushed, l2: l2Flushed } };
}
