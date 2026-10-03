import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: '@sve/shadowshowdown', environment: 'node', include: ['src/**/*.test.ts'] },
});
