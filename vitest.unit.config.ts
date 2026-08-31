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
    // src/lib/supabase.ts throws at module scope when these are unset, and it
    // is pulled in transitively by any test that loads the real
    // importExecution (importWizard's vi.mock uses importOriginal). Without
    // these, the suite passes on a machine that happens to have a .env and
    // fails in CI, which has none. Values are deliberately fake: unit tests
    // never make network calls, they only need the client to construct.
    env: {
      VITE_SUPABASE_URL: 'https://unit-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'unit-test-anon-key',
    },
  },
})
