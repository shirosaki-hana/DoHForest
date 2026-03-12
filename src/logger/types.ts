export const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_CATEGORIES = ['system', 'database', 'webui', 'dns'] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

export type SaveLogFn = (
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: unknown,
  timestamp?: Date
) => Promise<void>;

export interface LogItem {
  id: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  meta: string | null;
  createdAt: string;
}

export interface GetLogsRequest {
  level?: LogLevel;
  levels?: LogLevel[];
  category?: LogCategory;
  categories?: LogCategory[];
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
}

export interface GetLogsResponse {
  success: true;
  logs: LogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LogStatsResponse {
  success: true;
  stats: {
    total: number;
    byLevel: Record<LogLevel, number>;
    byCategory: Record<LogCategory, number>;
    last24h: number;
    last7d: number;
  };
}

export interface DeleteLogsRequest {
  ids?: number[];
  olderThan?: string;
  level?: LogLevel;
}

export interface DeleteLogsResponse {
  success: true;
  deletedCount: number;
}

export interface LogSettings {
  retentionDays: number;
  maxLogs: number;
}

export interface LogSettingsResponse {
  success: true;
  settings: LogSettings;
}
