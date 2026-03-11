import type { LogLevel, LogCategory } from './types.js';

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
let saveToDbFn:
  | ((
      level: LogLevel,
      category: LogCategory,
      message: string,
      meta?: unknown,
      timestamp?: Date
    ) => Promise<void>)
  | null = null;

/**
 * DB 저장 함수 설정 및 대기 중인 로그 flush
 */
export const initializeLogDb = async (
  fn: (
    level: LogLevel,
    category: LogCategory,
    message: string,
    meta?: unknown,
    timestamp?: Date
  ) => Promise<void>
): Promise<void> => {
  saveToDbFn = fn;
  isDbReady = true;

  // 대기 중인 로그들을 DB에 저장
  if (logQueue.length > 0) {
    const queuedLogs = [...logQueue];
    logQueue = [];

    for (const log of queuedLogs) {
      try {
        await fn(log.level, log.category, log.message, log.meta, log.timestamp);
      } catch {
        // 저장 실패 시 무시 (이미 큐에서 제거됨)
      }
    }
  }
};

//------------------------------------------------------------------------------//
// 메인 로그 함수

const log = (
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: unknown
): void => {
  const timestamp = new Date();

  if (isDbReady && saveToDbFn) {
    // DB가 준비됨 - 바로 저장
    saveToDbFn(level, category, message, meta, timestamp).catch(() => {});
  } else {
    // DB 미준비 - 큐에 저장
    logQueue.push({ level, category, message, meta, timestamp });
  }
};

//------------------------------------------------------------------------------//
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

//------------------------------------------------------------------------------//
// 콘솔 로그 유틸 (비상용 - ESLint no-console 규칙 우회)

/* eslint-disable no-console */
export const console_log = (...args: unknown[]): void => {
  console.log(...args);
};

export const console_error = (...args: unknown[]): void => {
  console.error(...args);
};

export const console_warn = (...args: unknown[]): void => {
  console.warn(...args);
};

export const console_debug = (...args: unknown[]): void => {
  console.debug(...args);
};
/* eslint-enable no-console */
