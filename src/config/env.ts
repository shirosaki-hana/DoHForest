import dotenv from 'dotenv';
import { z } from 'zod';
// import ms from 'ms';
import path from 'path';
import { projectRoot } from '../utils/dir.js';
//------------------------------------------------------------------------------//

dotenv.config({ path: path.resolve(projectRoot, '.env'), quiet: true });

// ms 라이브러리 형식의 시간 문자열을 검증하는 Zod 스키마
/* 나중에 쓰면 유용할 듯
const msStringSchema = z
  .string()
  .refine(
    val => {
      try {
        const result = ms(val as ms.StringValue);
        return typeof result === 'number' && !isNaN(result);
      } catch {
        return false;
      }
    },
    { message: 'Invalid time format (e.g., "24h", "10s", "7d")' }
  )
  .transform(val => val as ms.StringValue);
*/
// MB 단위 문자열을 바이트로 변환하는 Zod 스키마 팩토리
const mbToBytes = (defaultMb: string) =>
  z
    .string()
    .default(defaultMb)
    .refine((val) => /^\d+mb$/i.test(val), {
      message: 'Invalid size format (e.g., "10mb", "50mb")',
    })
    .transform((val) => parseInt(val.replace(/mb$/i, ''), 10) * 1024 * 1024);

// 환경 변수 Zod 스키마
const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().min(1).max(65535).default(4001),
  REQUEST_BODY_LIMIT: mbToBytes('10mb'),
  DB_PATH: z.string().default('./data/dohforest.db'),
});

// 환경변수 파싱
export const env = envSchema.parse(process.env);
export type Environment = typeof env;
