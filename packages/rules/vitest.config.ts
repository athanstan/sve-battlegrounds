import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@sve/rules',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
