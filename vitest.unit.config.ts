import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Unit and component tests: no network, safe to run anywhere including CI.
 * The remote RLS suite is kept separate in vitest.config.ts because it needs a
 * staging Supabase project and must never run unattended.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
})
