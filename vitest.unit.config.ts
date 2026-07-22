import { defineConfig } from 'vitest/config'

/**
 * Unit tests: pure logic, no network, safe to run anywhere including CI.
 * The remote RLS suite is kept separate in vitest.config.ts because it needs a
 * staging Supabase project and must never run unattended.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
