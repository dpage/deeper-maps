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
        'src/main.tsx',
        'src/App.tsx',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/__tests__/**',
      ],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
        // Per-file enforcement on the pure-functional core
        'src/analysis/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/storage/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/state/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/lib/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
  },
});
