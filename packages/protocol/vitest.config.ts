import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: '@sve/protocol', environment: 'node', include: ['src/**/*.test.ts'] },
});
