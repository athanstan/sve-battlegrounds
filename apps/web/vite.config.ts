import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // WEB_PORT lets the Docker setup sit beside other apps that already own 5173.
  server: { port: Number(process.env.WEB_PORT ?? 5173), strictPort: true },
  build: { target: 'es2023', sourcemap: true },
  test: {
    name: '@sve/web',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
