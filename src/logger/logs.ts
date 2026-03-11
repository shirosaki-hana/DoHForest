import { database } from '../database/index.js';
import { initializeLogDb } from './index.js';
import type {
  LogLevel,
  LogCategory,
  GetLogsRequest,
  LogSettings,
} from './types.js';
//------------------------------------------------------------------------------//

// 로그 DB 저장 함수 (timestamp 지원)
const saveLogToDb = async (
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: unknown,
  timestamp?: Date
): Promise<void> => {
  await database.logs.create(level, category, message, meta, timestamp);
};

// 로거 초기화 (DB 준비 후 호출 - 대기 중인 로그도 flush됨)
export const initializeLogger = async (): Promise<void> => {
  await initializeLogDb(saveLogToDb);
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

  // 특정 ID 삭제
  if (ids && ids.length > 0) {
    return database.logs.deleteByIds(ids);
  }

  // 조건 기반 삭제
  return database.logs.deleteByCondition({ olderThan, level });
};

// 오래된 로그 자동 정리
export const cleanupOldLogs = async (
  settings: LogSettings
): Promise<number> => {
  const { retentionDays, maxLogs } = settings;

  let deletedCount = 0;

  // 1. 보관 기간 초과 로그 삭제
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  deletedCount += await database.logs.deleteOlderThan(cutoffDate);

  // 2. 최대 개수 초과 로그 삭제 (가장 오래된 것부터)
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
