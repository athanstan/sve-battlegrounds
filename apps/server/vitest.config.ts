import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@sve/server',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests boot real servers on real ports; give sockets room to settle.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
