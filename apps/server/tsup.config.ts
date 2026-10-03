import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // The workspace packages ship TypeScript source, so they are compiled into the bundle;
  // everything from npm stays external and is installed normally.
  noExternal: [/^@sve\//],
});
