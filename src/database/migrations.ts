import fs from 'node:fs/promises';
import path from 'node:path';
import { execRawSql, queryRawSql, withTransaction } from './connection.js';
import { projectRoot } from '../config/dir.js';
import { logger } from '../logger/index.js';
//------------------------------------------------------------------------------//

/**
 * 마이그레이션 디렉토리 경로
 * backendRoot는 dev/production 모두 backend/ 디렉토리를 가리킴
 */
const MIGRATIONS_DIR = path.resolve(projectRoot, 'migrations');

/**
 * 파일명 파싱 정규식: 0001_migration_name.sql
 */
const MIGRATION_FILE_PATTERN = /^(\d+)_(.+)\.sql$/;

interface Migration {
  version: number;
  name: string;
  up: string;
}

/**
 * migrations/ 디렉토리에서 .sql 파일을 읽어 마이그레이션 목록을 로드
 *
 * 파일명 규칙: {version}_{name}.sql (예: 0001_initial_schema.sql)
 * - version: 숫자로 된 순서 (0-패딩 권장하지만 필수 아님)
 * - name: 마이그레이션 설명 (snake_case)
 *
 * 새 마이그레이션 추가 시 migrations/ 디렉토리에 .sql 파일만 추가하면 됩니다.
 */
async function loadMigrations(): Promise<Migration[]> {
  try {
    await fs.access(MIGRATIONS_DIR);
  } catch {
    logger.warn('database', 'Migrations directory not found', {
      path: MIGRATIONS_DIR,
    });
    return [];
  }

  const allFiles = await fs.readdir(MIGRATIONS_DIR);
  const files = allFiles.filter((f) => MIGRATION_FILE_PATTERN.test(f)).sort(); // 파일명 사전순 정렬 = 버전 순서

  const migrations: Migration[] = [];

  for (const file of files) {
    const match = file.match(MIGRATION_FILE_PATTERN);
    if (!match) {
      continue;
    }

    const version = parseInt(match[1], 10);
    const name = match[2];
    const filePath = path.join(MIGRATIONS_DIR, file);
    const up = await fs.readFile(filePath, 'utf-8');

    migrations.push({ version, name, up });
  }

  // 버전 중복 검증
  const versions = new Set<number>();
  for (const m of migrations) {
    if (versions.has(m.version)) {
      throw new Error(`Duplicate migration version: ${m.version} (${m.name})`);
    }
    versions.add(m.version);
  }

  return migrations;
}

/**
 * 마이그레이션 테이블 생성
 */
function ensureMigrationTable(): void {
  execRawSql(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);
}

/**
 * 현재 적용된 마이그레이션 버전 조회
 */
function getCurrentVersion(): number {
  const result = queryRawSql<{ version: number }>(
    'SELECT MAX(version) as version FROM _migrations'
  );
  return result?.version ?? 0;
}

/**
 * 마이그레이션 적용 기록
 */
function recordMigration(version: number, name: string): void {
  execRawSql(
    `INSERT INTO _migrations (version, name) VALUES (${version}, '${name}')`
  );
}

/**
 * 런타임 마이그레이션 실행
 */
export async function runMigrations(): Promise<{
  applied: number;
  current: number;
}> {
  const startTime = Date.now();

  // 마이그레이션 테이블 확인/생성
  ensureMigrationTable();

  // .sql 파일에서 마이그레이션 로드
  const migrations = await loadMigrations();

  const currentVersion = getCurrentVersion();
  const latestVersion =
    migrations.length > 0 ? migrations[migrations.length - 1].version : 0;
  const pendingMigrations = migrations.filter(
    (m) => m.version > currentVersion
  );

  logger.info('database', 'Migration status checked', {
    migrationsDir: MIGRATIONS_DIR,
    currentVersion,
    latestVersion,
    pendingCount: pendingMigrations.length,
    totalMigrations: migrations.length,
  });

  let appliedCount = 0;

  // 미적용 마이그레이션 순차 실행
  for (const migration of pendingMigrations) {
    logger.info('database', 'Applying migration', {
      version: migration.version,
      name: migration.name,
    });

    try {
      // 트랜잭션으로 마이그레이션 SQL
      withTransaction(() => {
        execRawSql(migration.up);
        recordMigration(migration.version, migration.name);
      });
      appliedCount++;

      logger.info('database', 'Migration applied successfully', {
        version: migration.version,
        name: migration.name,
      });
    } catch (error) {
      logger.error('database', 'Migration failed and rolled back', {
        version: migration.version,
        name: migration.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  const totalDuration = Date.now() - startTime;

  if (appliedCount > 0) {
    logger.info('database', 'All migrations completed', {
      appliedCount,
      totalDurationMs: totalDuration,
      finalVersion: latestVersion,
    });
  }

  return {
    applied: appliedCount,
    current: latestVersion,
  };
}

/**
 * 마이그레이션 상태 조회
 */
export async function getMigrationStatus(): Promise<{
  current: number;
  latest: number;
  pending: number;
}> {
  ensureMigrationTable();
  const currentVersion = getCurrentVersion();
  const migrations = await loadMigrations();
  const latestVersion =
    migrations.length > 0 ? migrations[migrations.length - 1].version : 0;

  return {
    current: currentVersion,
    latest: latestVersion,
    pending: latestVersion - currentVersion,
  };
}
