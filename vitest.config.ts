import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Exclude Playwright E2E specs — they use Playwright's `test.describe()` which Vitest can't parse.
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['app/**', 'components/**', 'hooks/**', 'lib/**'],
      exclude: [
        '**/*.d.ts',
        '**/*.config.*',
        '**/node_modules/**',
        '**/.next/**',
        '**/__tests__/**',
        'lib/supabase/database.types.ts',
        'scripts/**',
        'phase4-dumps/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
