import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Organization } from '../types/database'

interface AuthState {
  user: User | null
  org: Organization | null
  setUser: (user: User | null) => void
  setOrg: (org: Organization | null) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      org: null,
      setUser: (user) => set({ user }),
      setOrg: (org) => set({ org }),
      clearAuth: () => set({ user: null, org: null }),
    }),
    { name: 'pm-auth' }
  )
)
