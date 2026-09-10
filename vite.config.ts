import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so a built bundle can be opened from any subpath.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    // The engine is pure TypeScript with no DOM dependency, so tests run in
    // plain Node. Persistence tests inject an in-memory Storage shim instead
    // of pulling in jsdom.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
