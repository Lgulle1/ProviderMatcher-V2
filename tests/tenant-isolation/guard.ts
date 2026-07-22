const PRODUCTION_PROJECT_REF = 'wuhtfeptdrbdlmnxtumo'

export type TestEnv = {
  url: string
  anonKey: string
  serviceRoleKey: string
}

export function loadTestEnv(): TestEnv {
  if (process.env.ALLOW_REMOTE_SUPABASE_TESTS !== 'true') {
    throw new Error(
      'Refusing to run remote Supabase tests: set ALLOW_REMOTE_SUPABASE_TESTS=true in .env.test.local'
    )
  }

  const url = process.env.SUPABASE_TEST_URL?.trim()
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY?.trim()
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY?.trim()

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, or SUPABASE_TEST_SERVICE_ROLE_KEY in .env.test.local'
    )
  }

  if (url.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(
      `Refusing to run against production project reference (${PRODUCTION_PROJECT_REF})`
    )
  }

  return { url, anonKey, serviceRoleKey }
}

/** Called at module load from setup.ts before any test file runs. */
loadTestEnv()
