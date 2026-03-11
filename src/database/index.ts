import { logger } from '../utils/log.js';
import {
  db,
  checkDatabaseConnection as checkConnection,
  disconnectDatabase as disconnect,
  isDatabaseConnected as isConnected,
  ensureDbDirectory,
} from './connection.js';
import { runMigrations } from './migrations.js';
import { LogRepository } from './repositories/log.js';
//------------------------------------------------------------------------------//

/**
 * 통합 Database 클래스
 * Repository 패턴으로 데이터 액세스 추상화
 */
class Database {
  readonly logs: LogRepository;
  constructor() {
    this.logs = new LogRepository(db);
  }
}

// 싱글톤 인스턴스
export const database = new Database();

/**
 * 데이터베이스 초기화 (디렉토리 생성 + 연결 확인 + 마이그레이션)
 */
export async function initializeDatabase(): Promise<void> {
  logger.info('database', 'Database initialization started');

  try {
    await ensureDbDirectory(); // 1. 디렉토리 생성 (비동기)
    checkConnection(); // 2. 연결 테스트
    const { applied, current } = await runMigrations(); // 3. 마이그레이션 실행
    if (applied > 0) {
      logger.info(
        'database',
        `Applied ${applied} migration(s), now at version ${current}`
      );
    } else {
      logger.info(
        'database',
        `Database schema up to date (version ${current})`
      );
    }
    logger.info('database', 'Database initialization completed');
  } catch (error) {
    logger.error('database', 'Database initialization failed', {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error),
    });
    throw error;
  }
}

/**
 * 데이터베이스 연결 해제
 */
export function disconnectDatabase(): void {
  disconnect();
  logger.info('database', 'Database connection closed successfully');
}

/**
 * 데이터베이스 연결 여부 확인 (헬스체크용)
 */
export function isDatabaseConnected(): boolean {
  return isConnected();
}

// Re-export for direct access if needed
export { db } from './connection.js';
export { getMigrationStatus } from './migrations.js';
export * from './schema.js';
