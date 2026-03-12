import type { LogLevel, LogCategory, SaveLogFn } from './types.js';
//------------------------------------------------------------------------------//

// 로그 큐 시스템 (DB 준비 전 로그 버퍼링)
interface QueuedLog {
  level: LogLevel;
  category: LogCategory;
  message: string;
  meta?: unknown;
  timestamp: Date;
}

// 내부 상태
let logQueue: QueuedLog[] = [];
let isDbReady = false;
let saveToDbFn: SaveLogFn | null = null;

/**
 * DB 저장 함수 설정 및 대기 중인 로그 flush
 * @internal logger/service.ts 에서만 호출
 */
export const initializeLogDb = async (fn: SaveLogFn): Promise<void> => {
  saveToDbFn = fn;
  isDbReady = true;

  if (logQueue.length > 0) {
    const queuedLogs = [...logQueue];
    logQueue = [];

    for (const log of queuedLogs) {
      try {
        await fn(log.level, log.category, log.message, log.meta, log.timestamp);
      } catch {
        // DB 준비 전 기록된 로그는 유실되면 치명적인 것들이 없으니 조용히 무시
      }
    }
  }
};

// 메인 로그 함수

const log = (
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: unknown
): void => {
  const timestamp = new Date();

  if (isDbReady && saveToDbFn) {
    saveToDbFn(level, category, message, meta, timestamp).catch(() => {});
  } else {
    logQueue.push({ level, category, message, meta, timestamp });
  }
};

// Logger 인터페이스
export const logger = {
  error: (category: LogCategory, message: string, meta?: unknown) =>
    log('ERROR', category, message, meta),
  warn: (category: LogCategory, message: string, meta?: unknown) =>
    log('WARN', category, message, meta),
  info: (category: LogCategory, message: string, meta?: unknown) =>
    log('INFO', category, message, meta),
  debug: (category: LogCategory, message: string, meta?: unknown) =>
    log('DEBUG', category, message, meta),
};
