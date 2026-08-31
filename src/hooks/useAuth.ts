import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { User, Organization } from '../types/database'

type AuthResult = {
  user: User | null
  org: Organization | null
  error: string | null
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      return { user: null, org: null, error: 'Invalid email or password' }
    }

    const authUser = signInData.user
    if (!authUser) {
      return { user: null, org: null, error: 'Invalid email or password' }
    }

    const { data: existingUserRow, error: userFetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle()

    if (userFetchError) {
      await supabase.auth.signOut()
      return { user: null, org: null, error: 'Unable to load the user profile' }
    }

    let userRow = existingUserRow
    let bootstrappedOrg: Organization | null = null
    if (!userRow) {
      const metadata = authUser.user_metadata as Record<string, unknown>
      const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''
      const organizationName = typeof metadata.organization_name === 'string'
        ? metadata.organization_name.trim()
        : ''
      if (!fullName || !organizationName) {
        await supabase.auth.signOut()
        return { user: null, org: null, error: 'Invitation setup is incomplete. Contact your administrator.' }
      }

      const { data: signupResult, error: signupError } = await supabase.rpc('complete_signup', {
        p_org_name: organizationName,
        p_user_name: fullName,
      })
      if (signupError || !signupResult) {
        await supabase.auth.signOut()
        return { user: null, org: null, error: signupError?.message ?? 'Unable to complete the invitation' }
      }
      const result = signupResult as { user: User; org: Organization }
      userRow = result.user
      bootstrappedOrg = result.org
    }

    const user = userRow as User

    const orgResult = bootstrappedOrg
      ? { data: bootstrappedOrg, error: null }
      : await supabase
          .from('organizations')
          .select('*')
          .eq('id', user.org_id)
          .maybeSingle()
    const { data: orgRow, error: orgFetchError } = orgResult

    if (orgFetchError || !orgRow) {
      return { user: null, org: null, error: 'Organization not found' }
    }

    const org = orgRow as Organization

    useAuthStore.getState().setUser(user)
    useAuthStore.getState().setOrg(org)

    return { user, org, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unexpected error occurred'
    return { user: null, org: null, error: message }
  }
}

export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut()
  } catch {
    /* never throw */
  }
  try {
    useAuthStore.getState().clearAuth()
    if (typeof window !== 'undefined') window.sessionStorage.removeItem('pm-last-activity')
  } catch {
    /* never throw */
  }
}

export async function getSession(): Promise<{ user: User; org: Organization } | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData.session
    if (!session?.user) {
      return null
    }

    const { data: existingUserRow, error: userFetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()

    if (userFetchError) {
      return null
    }

    let userRow = existingUserRow
    let invitedOrg: Organization | null = null
    if (!userRow) {
      const metadata = session.user.user_metadata as Record<string, unknown>
      const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''
      const organizationName = typeof metadata.organization_name === 'string'
        ? metadata.organization_name.trim()
        : ''
      if (!fullName || !organizationName) return null
      const { data: signupResult, error: signupError } = await supabase.rpc('complete_signup', {
        p_org_name: organizationName,
        p_user_name: fullName,
      })
      if (signupError || !signupResult) return null
      const result = signupResult as { user: User; org: Organization }
      userRow = result.user
      invitedOrg = result.org
    }

    const user = userRow as User

    const orgResult = invitedOrg
      ? { data: invitedOrg, error: null }
      : await supabase
          .from('organizations')
          .select('*')
          .eq('id', user.org_id)
          .maybeSingle()
    const { data: orgRow, error: orgFetchError } = orgResult

    if (orgFetchError || !orgRow) {
      return null
    }

    const org = orgRow as Organization

    useAuthStore.getState().setUser(user)
    useAuthStore.getState().setOrg(org)

    return { user, org }
  } catch {
    return null
  }
}
