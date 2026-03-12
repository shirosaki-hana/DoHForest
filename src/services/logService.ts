import { z } from 'zod';
import { logStore } from '../logger/index.js';
import { LOG_LEVELS, LOG_CATEGORIES, type GetLogsRequest } from '../logger/types.js';
//------------------------------------------------------------------------------//

const logLevelEnum = z.enum(LOG_LEVELS);
const logCategoryEnum = z.enum(LOG_CATEGORIES);
const sortOrderEnum = z.enum(['asc', 'desc']);

const isoDateString = z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid ISO date string' });

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

export function queryLogs(input: QueryLogsInput) {
  const params: GetLogsRequest = queryLogsSchema.parse(input);
  return logStore.query(params);
}

// --- Stats ---

export function getLogStats() {
  return logStore.getStats();
}

// --- Meta (for UI filter dropdowns) ---

export function getLogMeta() {
  return {
    levels: LOG_LEVELS as readonly string[],
    categories: LOG_CATEGORIES as readonly string[],
  };
}
