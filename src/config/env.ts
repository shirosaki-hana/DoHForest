import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { projectRoot } from '../config/dir.js';
//------------------------------------------------------------------------------//

dotenv.config({ path: path.resolve(projectRoot, '.env'), quiet: true });
// 환경 변수 Zod 스키마
const envSchema = z.object({
  // WebUI
  WEBUI_HOST: z.string().default('127.0.0.1'),
  WEBUI_PORT: z.coerce.number().min(1).max(65535).default(4001),
  DB_PATH: z.string().default('./data/dohforest.db'),

  // DNS 리스너
  DNS_HOST: z.string().default('127.0.0.1'),
  DNS_PORT: z.coerce.number().min(1).max(65535).default(15353),

  // DoH 업스트림
  DOH_PRIMARY: z.url().default('https://cloudflare-dns.com/dns-query'),
  DOH_SECONDARY: z.url().default('https://dns.google/dns-query'),
  DOH_TIMEOUT: z.coerce.number().min(500).max(30000).default(5000),

  // DNS 캐시
  CACHE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  CACHE_MIN_TTL: z.coerce.number().min(0).default(60),
  CACHE_MAX_TTL: z.coerce.number().min(0).default(86400),
  CACHE_MAX_ITEMS: z.coerce.number().min(100).max(100_000).default(5000),

  // 스케줄러
  CACHE_PURGE_INTERVAL_MIN: z.coerce.number().min(1).default(5),
  LOG_CLEANUP_INTERVAL_MIN: z.coerce.number().min(1).default(60),
  LOG_RETENTION_DAYS: z.coerce.number().min(1).max(3650).default(30),
  LOG_MAX_COUNT: z.coerce.number().min(100).max(10_000_000).default(100_000),
});

// 환경변수 파싱
export const env = envSchema.parse(process.env);
export type Environment = typeof env;
