import { z } from 'zod';
import { database } from '../database/index.js';
import {
  LOG_LEVELS,
  LOG_CATEGORIES,
  type GetLogsRequest,
  type LogSettings,
} from '../logger/types.js';
//------------------------------------------------------------------------------//

const logLevelEnum = z.enum(LOG_LEVELS);
const logCategoryEnum = z.enum(LOG_CATEGORIES);
const sortOrderEnum = z.enum(['asc', 'desc']);

const isoDateString = z.string().refine(
  (v) => !isNaN(Date.parse(v)),
  { message: 'Invalid ISO date string' },
);

// --- Query Logs ---

const queryLogsSchema = z.object({
  level: logLevelEnum.optional(),
  levels: z.array(logLevelEnum).optional(),
  category: logCategoryEnum.optional(),
  categories: z.array(logCategoryEnum).optional(),
  search: z.string().max(200).optional(),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
  sortOrder: sortOrderEnum.default('desc'),
});

export type QueryLogsInput = z.input<typeof queryLogsSchema>;

export async function queryLogs(input: QueryLogsInput) {
  const params: GetLogsRequest = queryLogsSchema.parse(input);
  return database.logs.findMany(params);
}

// --- Stats ---

export async function getLogStats() {
  return database.logs.getStats();
}

// --- Meta (for UI filter dropdowns) ---

export function getLogMeta() {
  return {
    levels: LOG_LEVELS as readonly string[],
    categories: LOG_CATEGORIES as readonly string[],
  };
}

// --- Delete ---

const deleteByIdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
});

const deleteByConditionSchema = z.object({
  olderThan: isoDateString.optional(),
  level: logLevelEnum.optional(),
}).refine(
  (v) => v.olderThan !== undefined || v.level !== undefined,
  { message: 'At least one condition (olderThan or level) is required' },
);

const deleteLogsSchema = z.union([
  deleteByIdsSchema,
  deleteByConditionSchema,
]);

export type DeleteLogsInput = z.input<typeof deleteLogsSchema>;

export async function deleteLogs(input: DeleteLogsInput) {
  const parsed = deleteLogsSchema.parse(input);

  if ('ids' in parsed) {
    const count = await database.logs.deleteByIds(parsed.ids);
    return { deletedCount: count };
  }

  const { olderThan, level } = parsed;
  const count = await database.logs.deleteByCondition({ olderThan, level });
  return { deletedCount: count };
}

// --- Cleanup ---

const cleanupSchema = z.object({
  retentionDays: z.number().int().min(1).max(3650).default(30),
  maxLogs: z.number().int().min(100).max(10_000_000).default(100_000),
});

export type CleanupLogsInput = z.input<typeof cleanupSchema>;

export async function cleanupLogs(input: CleanupLogsInput) {
  const settings: LogSettings = cleanupSchema.parse(input);

  let deletedCount = 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - settings.retentionDays);
  deletedCount += await database.logs.deleteOlderThan(cutoffDate);

  const currentCount = await database.logs.count();
  if (currentCount > settings.maxLogs) {
    const excessCount = currentCount - settings.maxLogs;
    const oldestIds = await database.logs.getOldestIds(excessCount);
    if (oldestIds.length > 0) {
      deletedCount += await database.logs.deleteByIds(oldestIds);
    }
  }

  return { deletedCount };
}
