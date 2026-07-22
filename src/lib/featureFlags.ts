/** Sign-up UI is enabled only when VITE_ENABLE_SIGNUP is exactly the string "true". */
export function isSignupEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_SIGNUP === 'true'
}
