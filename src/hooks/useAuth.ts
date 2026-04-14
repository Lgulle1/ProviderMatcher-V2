import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { User, Organization } from '../types/database'

type AuthResult = {
  user: User | null
  org: Organization | null
  error: string | null
}

export async function signUp(
  email: string,
  password: string,
  name: string,
  orgName: string
): Promise<AuthResult> {
  try {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (signUpError) {
      return { user: null, org: null, error: signUpError.message }
    }

    const authUser = signUpData.user
    if (!authUser) {
      return { user: null, org: null, error: 'Sign up did not return a user' }
    }

    const { data: orgRecord, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: orgName })
      .select()
      .single()

    if (orgError || !orgRecord) {
      return { user: null, org: null, error: 'Failed to create organization' }
    }

    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .insert({
        id: authUser.id,
        org_id: orgRecord.id as string,
        name,
        email,
      })
      .select()
      .single()

    if (userError || !userRecord) {
      return { user: null, org: null, error: 'Failed to create user record' }
    }

    const user = userRecord as User
    const org = orgRecord as Organization

    useAuthStore.getState().setUser(user)
    useAuthStore.getState().setOrg(org)

    return { user, org, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unexpected error occurred'
    return { user: null, org: null, error: message }
  }
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

    const { data: userRow, error: userFetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle()

    if (userFetchError || !userRow) {
      return { user: null, org: null, error: 'User record not found' }
    }

    const user = userRow as User

    const { data: orgRow, error: orgFetchError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', user.org_id)
      .maybeSingle()

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

    const { data: userRow, error: userFetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()

    if (userFetchError || !userRow) {
      return null
    }

    const user = userRow as User

    const { data: orgRow, error: orgFetchError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', user.org_id)
      .maybeSingle()

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
