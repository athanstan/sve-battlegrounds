import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@sve/cards',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
