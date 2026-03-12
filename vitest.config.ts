import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/test/**/*.test.ts'],
    globalSetup: 'src/test/globalSetup.ts',
    testTimeout: 10_000,
    hookTimeout: 15_000,
    fileParallelism: false,
  },
});
