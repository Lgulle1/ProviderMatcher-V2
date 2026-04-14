import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useToast } from '../../components/ui/Toast'
import type { Organization, User } from '../../types/database'

type OrgFormValues = {
  name: string
  fallback_phone: string
  fallback_message: string
  allowed_domains_text: string
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const org = useAuthStore((s) => s.org)
  const setUser = useAuthStore((s) => s.setUser)
  const setOrg = useAuthStore((s) => s.setOrg)
  const { toast } = useToast()

  const [modal, setModal] = useState<{ type: 'change-password' | null }>({ type: null })
  const [accountName, setAccountName] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [orgSaving, setOrgSaving] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, errors },
  } = useForm<OrgFormValues>({
    defaultValues: {
      name: '',
      fallback_phone: '',
      fallback_message: '',
      allowed_domains_text: '',
    },
  })

  useEffect(() => {
    if (!org) {
      return
    }
    reset({
      name: org.name,
      fallback_phone: org.fallback_phone ?? '',
      fallback_message: org.fallback_message,
      allowed_domains_text: (org.allowed_domains ?? []).join('\n'),
    })
  }, [org, reset])

  useEffect(() => {
    setAccountName(user?.name ?? '')
  }, [user?.id, user?.name])

  const closePasswordModal = useCallback(() => {
    setModal({ type: null })
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError('')
  }, [])

  useEffect(() => {
    if (modal.type !== 'change-password') {
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePasswordModal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modal.type, closePasswordModal])

  useEffect(() => {
    if (modal.type) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [modal.type])

  const onSaveOrg = handleSubmit(async (values) => {
    if (!org) {
      return
    }
    setOrgSaving(true)
    const allowed_domains = values.allowed_domains_text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const { data, error } = await supabase
      .from('organizations')
      .update({
        name: values.name.trim(),
        fallback_phone: values.fallback_phone.trim() || null,
        fallback_message: values.fallback_message,
        allowed_domains,
      })
      .eq('id', org.id)
      .select()
      .single()

    setOrgSaving(false)

    if (error || !data) {
      toast.error(error?.message ?? 'Failed to save organization')
      return
    }

    const updated = data as Organization
    setOrg(updated)
    toast.success('Settings saved')
    reset({
      name: updated.name,
      fallback_phone: updated.fallback_phone ?? '',
      fallback_message: updated.fallback_message,
      allowed_domains_text: (updated.allowed_domains ?? []).join('\n'),
    })
  })

  const accountNameChanged = accountName.trim() !== (user?.name ?? '').trim()

  async function onSaveAccount() {
    if (!user || !accountNameChanged) {
      return
    }
    setAccountSaving(true)
    const newName = accountName.trim() || null
    const { data, error } = await supabase
      .from('users')
      .update({ name: newName })
      .eq('id', user.id)
      .select()
      .single()

    setAccountSaving(false)

    if (error || !data) {
      toast.error(error?.message ?? 'Failed to update account')
      return
    }

    const updated = data as User
    setUser({ ...user, ...updated })
    toast.success('Account updated')
  }

  async function onSavePassword() {
    setPasswordError('')
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    setPasswordSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordSaving(false)

    if (error) {
      setPasswordError(error.message)
      return
    }

    closePasswordModal()
    toast.success('Password updated')
  }

  if (!org || !user) {
    return <p className="text-sm text-slate-500">Loading settings…</p>
  }

  return (
    <div>
      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-6 font-semibold text-slate-900">Organization Settings</h2>
        <form onSubmit={onSaveOrg} className="space-y-5">
          <div>
            <label htmlFor="org-name" className="mb-1 block text-sm font-medium text-slate-700">
              Organization Name
            </label>
            <input
              id="org-name"
              type="text"
              {...register('name', { required: 'Organization name is required' })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {errors.name ? <p className="mt-1 text-sm text-red-600">{errors.name.message}</p> : null}
          </div>

          <div>
            <label htmlFor="org-fallback-phone" className="mb-1 block text-sm font-medium text-slate-700">
              Fallback Phone
            </label>
            <input
              id="org-fallback-phone"
              type="text"
              {...register('fallback_phone')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-500">Shown to patients when no providers match</p>
          </div>

          <div>
            <label htmlFor="org-fallback-message" className="mb-1 block text-sm font-medium text-slate-700">
              Fallback Message
            </label>
            <textarea
              id="org-fallback-message"
              rows={3}
              {...register('fallback_message')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Message shown when widget finds no matching providers
            </p>
          </div>

          <div>
            <label htmlFor="org-domains" className="mb-1 block text-sm font-medium text-slate-700">
              Allowed Embed Domains
            </label>
            <textarea
              id="org-domains"
              rows={3}
              placeholder={'yourwebsite.com\napp.yourwebsite.com'}
              {...register('allowed_domains_text')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              One domain per line. Leave empty to allow all domains.
            </p>
          </div>

          <button
            type="submit"
            disabled={!isDirty || orgSaving}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {orgSaving ? 'Saving…' : 'Save Organization Settings'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-6 font-semibold text-slate-900">Account</h2>

        <div className="mb-5">
          <span className="mb-1 block text-sm font-medium text-slate-700">Email Address</span>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
            {user.email}
          </div>
          <p className="mt-1 text-xs text-slate-500">Email cannot be changed</p>
        </div>

        <div className="mb-5">
          <label htmlFor="account-name" className="mb-1 block text-sm font-medium text-slate-700">
            Your Name
          </label>
          <input
            id="account-name"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          type="button"
          disabled={!accountNameChanged || accountSaving}
          onClick={() => void onSaveAccount()}
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {accountSaving ? 'Saving…' : 'Save Account'}
        </button>

        <button
          type="button"
          onClick={() => setModal({ type: 'change-password' })}
          className="mt-6 block w-full max-w-xs rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Change Password
        </button>
      </section>

      {modal.type === 'change-password' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onMouseDown={() => closePasswordModal()}
            aria-hidden
          />
          <div
            className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="change-password-title"
          >
            <h3 id="change-password-title" className="mb-4 text-lg font-semibold text-slate-900">
              Change Password
            </h3>

            <div className="space-y-4">
              <div>
                <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-slate-700">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-500">At least 8 characters</p>
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-slate-700">
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {passwordError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {passwordError}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePasswordModal}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={passwordSaving}
                onClick={() => void onSavePassword()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {passwordSaving ? 'Saving…' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
