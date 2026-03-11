import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { env } from '../config/env.js';
import { logger } from '../utils/log.js';
import * as schema from './schema.js';
//------------------------------------------------------------------------------//

// DATA_PATH에서 파생된 DB 경로 사용
export const dbPath = env.DB_PATH;

// 경로 정보 로깅
logger.debug('database', 'Database path resolved', {
  dataPath: env.DB_PATH,
  dbPath,
});

// node:sqlite 인스턴스 (동기식)
let sqliteDb: DatabaseSync | null = null;
let dbDirectoryReady = false;

/**
 * 데이터베이스 디렉토리 확인 및 생성 (비동기)
 * 서버 시작 시점에 호출되어야 함
 */
export async function ensureDbDirectory(): Promise<void> {
  if (dbDirectoryReady) {
    logger.debug('database', 'Database directory already ensured, skipping');
    return;
  }
  const dbDir = path.dirname(dbPath);

  // 디렉토리 존재 여부 확인
  let directoryExisted = true;
  try {
    await fs.access(dbDir);
  } catch {
    directoryExisted = false;
  }

  await fs.mkdir(dbDir, { recursive: true }); // recursive: true면 이미 존재해도 OK
  dbDirectoryReady = true;

  logger.info('database', 'Database directory ensured', {
    directory: dbDir,
    created: !directoryExisted,
  });
}

/**
 * SQLite 연결 초기화
 * 주의: ensureDbDirectory()가 먼저 호출되어야 함
 */
function getSqliteDb(): DatabaseSync {
  if (!sqliteDb) {
    logger.debug('database', 'Initializing SQLite connection', { dbPath });

    // DB 파일이 없으면 자동 생성됨 (node:sqlite 기본 동작)
    sqliteDb = new DatabaseSync(dbPath);

    // PRAGMA 설정
    const pragmas = {
      journalMode: 'WAL',
      synchronous: 'FULL',
      foreignKeys: true,
      busyTimeout: 5000,
    };

    // WAL 모드 활성화
    sqliteDb.exec('PRAGMA journal_mode = WAL');
    // 동기화 레벨 FULL
    sqliteDb.exec('PRAGMA synchronous = FULL');
    // 외래 키 제약 조건 활성화
    sqliteDb.exec('PRAGMA foreign_keys = ON');
    // 잠금 대기 시간 설정 (ms)
    sqliteDb.exec('PRAGMA busy_timeout = 5000');

    logger.info('database', 'SQLite connection initialized', {
      dbPath,
      pragmas,
    });
  }
  return sqliteDb;
}

/**
 * Drizzle ORM 인스턴스
 * node:sqlite는 동기식이므로 sqlite-proxy 드라이버 사용 (async 래핑)
 */
export const db = drizzle<typeof schema>(
  // 쿼리 실행 함수 (sqlite-proxy 요구사항 - async)
  async (sql, params, method) => {
    const sqlite = getSqliteDb();
    const stmt = sqlite.prepare(sql);

    // method에 따라 실행 방식 결정
    if (method === 'run') {
      // INSERT, UPDATE, DELETE
      stmt.run(...params);
      return { rows: [] };
    }

    if (method === 'get') {
      // 단일 행 조회
      const row = stmt.get(...params);
      return { rows: row ? [Object.values(row as object)] : [] };
    }

    // method === 'all' 또는 'values' - 다중 행 조회
    const rows = stmt.all(...params) as object[];
    return { rows: rows.map((row) => Object.values(row)) };
  },
  { schema }
);

// 타입 추출
export type Database = typeof db;

/**
 * 데이터베이스 연결 상태 확인
 */
export function checkDatabaseConnection(): void {
  const sqlite = getSqliteDb();
  const stmt = sqlite.prepare('SELECT 1');
  stmt.get();
  logger.info('database', 'Database connection established successfully');
}

/**
 * 데이터베이스 연결 해제
 * WAL 체크포인트를 먼저 실행하여 WAL 파일을 정리한 후 연결 종료
 */
export function disconnectDatabase(): void {
  if (!sqliteDb) {
    return;
  }
  try {
    // WAL 체크포인트 실행 (WAL 파일 내용을 메인 DB에 병합)
    // TRUNCATE 모드: 모든 프레임 체크포인트 후 WAL 파일 크기를 0으로
    sqliteDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (error) {
    // 체크포인트 실패해도 close는 시도
    console_warn(
      '[database] WAL checkpoint failed:',
      error instanceof Error ? error.message : String(error)
    );
  }
  sqliteDb.close();
  sqliteDb = null;
  console_log('[database] Database connection closed');
}

/**
 * 데이터베이스 연결 여부 확인 (헬스체크용)
 */
export function isDatabaseConnected(): boolean {
  try {
    if (!sqliteDb) {
      return false;
    }
    const stmt = sqliteDb.prepare('SELECT 1');
    stmt.get();
    return true;
  } catch {
    return false;
  }
}

/**
 * Raw SQL 실행 (마이그레이션용)
 */
export function execRawSql(sql: string): void {
  const sqlite = getSqliteDb();
  sqlite.exec(sql);
}

/**
 * Raw SQL 쿼리 (단일 값 조회용)
 */
export function queryRawSql<T>(sql: string): T | undefined {
  const sqlite = getSqliteDb();
  const stmt = sqlite.prepare(sql);
  return stmt.get() as T | undefined;
}

//------------------------------------------------------------------------------//
// 트랜잭션 관리

/**
 * 동기 트랜잭션 래퍼
 *
 * @example
 * withTransaction(() => {
 *   execRawSql('INSERT INTO ...');
 *   execRawSql('UPDATE ...');
 * });
 */
export function withTransaction<T>(fn: () => T): T {
  const sqlite = getSqliteDb();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    sqlite.exec('COMMIT');
    logger.debug('database', 'Transaction committed successfully');
    return result;
  } catch (error) {
    sqlite.exec('ROLLBACK');
    logger.warn('database', 'Transaction rolled back due to error', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * 비동기 트랜잭션 래퍼 - Drizzle ORM과 함께 사용
 * Repository 메서드에서 여러 DB 작업을 원자적으로 처리할 때 사용
 *
 * @example
 * await withTransactionAsync(async () => {
 *   await db.insert(table1).values(...);
 *   await db.update(table2).set(...);
 * });
 */
export async function withTransactionAsync<T>(
  fn: () => Promise<T>
): Promise<T> {
  const sqlite = getSqliteDb();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const result = await fn();
    sqlite.exec('COMMIT');
    logger.debug('database', 'Async transaction committed successfully');
    return result;
  } catch (error) {
    sqlite.exec('ROLLBACK');
    logger.warn('database', 'Async transaction rolled back due to error', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * WAL 체크포인트 실행
 * WAL 파일의 내용을 메인 DB 파일에 병합
 */
export function walCheckpoint(): void {
  const sqlite = getSqliteDb();
  sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  logger.info('database', 'WAL checkpoint completed');
}
