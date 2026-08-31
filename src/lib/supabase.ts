import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

const browserSessionStorage = typeof window === 'undefined' ? undefined : window.sessionStorage
if (typeof window !== 'undefined') {
  // Remove the former persistent browser token after moving authentication to
  // sessionStorage. Derive the exact project key so unrelated apps are untouched.
  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    window.localStorage.removeItem(`sb-${projectRef}-auth-token`)
    window.localStorage.removeItem('pm-auth')
  } catch {
    // URL validity is enforced by createClient below.
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: browserSessionStorage ? { storage: browserSessionStorage, persistSession: true } : undefined,
})
