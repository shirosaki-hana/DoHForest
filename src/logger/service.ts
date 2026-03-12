import { database } from '../database/index.js';
import { initializeLogDb } from './index.js';
import type { LogLevel, GetLogsRequest, LogSettings } from './types.js';
//------------------------------------------------------------------------------//

// 로거 초기화 (DB 준비 후 호출 - 대기 중인 로그도 flush됨)
export const initializeLogger = async (): Promise<void> => {
  await initializeLogDb((level, category, message, meta, timestamp) =>
    database.logs.create(level, category, message, meta, timestamp)
  );
};

// 로그 조회
export const getLogs = async (params: GetLogsRequest) => {
  return database.logs.findMany(params);
};

// 로그 통계
export const getLogStats = async () => {
  return database.logs.getStats();
};

// 로그 삭제
export const deleteLogs = async (params: {
  ids?: number[];
  olderThan?: string;
  level?: LogLevel;
}): Promise<number> => {
  const { ids, olderThan, level } = params;

  if (ids && ids.length > 0) {
    return database.logs.deleteByIds(ids);
  }

  return database.logs.deleteByCondition({ olderThan, level });
};

// 오래된 로그 자동 정리
export const cleanupOldLogs = async (
  settings: LogSettings
): Promise<number> => {
  const { retentionDays, maxLogs } = settings;

  let deletedCount = 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  deletedCount += await database.logs.deleteOlderThan(cutoffDate);

  const currentCount = await database.logs.count();
  if (currentCount > maxLogs) {
    const excessCount = currentCount - maxLogs;
    const oldestIds = await database.logs.getOldestIds(excessCount);

    if (oldestIds.length > 0) {
      deletedCount += await database.logs.deleteByIds(oldestIds);
    }
  }

  return deletedCount;
};
