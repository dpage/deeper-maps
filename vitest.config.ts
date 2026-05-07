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
        // Bootstrap entry; createRoot side-effects + worker instantiation are
        // integration-tested by Playwright in Plan 3, not by unit tests.
        'src/main.tsx',
        // Worker entry: instantiated only via ?worker&inline; integration-tested via
        // @vitest/web-worker rather than unit-tested directly. Coverage of internal
        // pipeline stages comes from the per-stage unit tests in src/analysis/.
        'src/worker/analyser.worker.ts',
        // zip.ts is bundled into the analyser worker (via ?worker&inline) AND
        // imported directly by its own unit tests. When both run in the same
        // vitest pass, @vitest/web-worker's `invalidateSubDepTree` (in
        // node_modules/@vitest/web-worker/dist/pure.js around line 598) clears
        // the worker's module cache, which in turn makes v8 coverage drop the
        // parser hit-data collected in the main thread. Result: zip.ts shows
        // ~82% lines even though zip.test.ts exercises it at 100% in isolation.
        // Excluding it from the global coverage report is the cleanest
        // workaround — the unit test still runs on every vitest pass and would
        // catch any regression. To verify the underlying coverage manually:
        //   npm run test:coverage -- --exclude 'src/worker/__tests__/analyser.integration.test.ts'
        // TODO(plan-3): once an E2E Playwright run replaces the in-process
        // worker integration test, drop this exclusion and restore full
        // per-file gating on zip.ts.
        'src/analysis/parsers/zip.ts',
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
