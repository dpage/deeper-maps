import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        // Bootstrap entry; createRoot side-effects + worker probe instantiation are
        // integration-tested by Playwright in Plan 3, not by unit tests.
        'src/main.tsx',
        // TODO: remove once App.tsx becomes the real composition root in Plan 2,
        // at which point it gets component tests via React Testing Library.
        'src/App.tsx',
        // Worker-inline probe; verified by build output (grep on dist/index.html),
        // not by unit tests. Removed in Plan 2 when the real worker lands.
        'src/probe/**',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/__tests__/**',
      ],
      thresholds: {
        perFile: true,
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
