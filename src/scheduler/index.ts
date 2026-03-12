import { env } from '../config/env.js';
import { logger } from '../logger/index.js';
import { purgeExpiredCache } from '../dns/cache.js';
import { cleanupOldLogs } from '../logger/service.js';
//------------------------------------------------------------------------------//

interface ScheduledTask {
  name: string;
  intervalMs: number;
  execute: () => Promise<void>;
  timer: ReturnType<typeof setInterval> | null;
}

const tasks: ScheduledTask[] = [];

function registerTask(
  name: string,
  intervalMs: number,
  execute: () => Promise<void>
): void {
  tasks.push({ name, intervalMs, execute, timer: null });
}

function runTask(task: ScheduledTask): void {
  task.execute().catch((err) => {
    logger.warn('system', `Scheduled task "${task.name}" failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * 스케줄러 시작 – 등록된 모든 작업을 주기적으로 실행
 */
export function startScheduler(): void {
  // DNS 캐시 만료 정리
  if (env.CACHE_ENABLED) {
    registerTask(
      'purge-expired-cache',
      env.CACHE_PURGE_INTERVAL_MIN * 60_000,
      async () => {
        const purged = await purgeExpiredCache();
        if (purged > 0) {
          logger.info(
            'system',
            `Scheduler: purged ${purged} expired cache entries`
          );
        }
      }
    );
  }

  // 오래된 로그 자동 정리
  registerTask(
    'cleanup-old-logs',
    env.LOG_CLEANUP_INTERVAL_MIN * 60_000,
    async () => {
      const deleted = await cleanupOldLogs({
        retentionDays: env.LOG_RETENTION_DAYS,
        maxLogs: env.LOG_MAX_COUNT,
      });
      if (deleted > 0) {
        logger.info(
          'system',
          `Scheduler: cleaned up ${deleted} old log entries`
        );
      }
    }
  );

  for (const task of tasks) {
    task.timer = setInterval(() => runTask(task), task.intervalMs);
  }

  const summary = tasks.map((t) => `${t.name} (${t.intervalMs / 60_000}min)`);
  logger.info('system', 'Scheduler started', { tasks: summary });
}

/**
 * 스케줄러 종료 – 모든 타이머 해제
 */
export function stopScheduler(): void {
  for (const task of tasks) {
    if (task.timer) {
      clearInterval(task.timer);
      task.timer = null;
    }
  }
  tasks.length = 0;
  logger.info('system', 'Scheduler stopped');
}
