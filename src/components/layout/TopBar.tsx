import { useAuthStore } from '../../stores/authStore'

interface TopBarProps {
  title: string
}

export default function TopBar({ title }: TopBarProps) {
  const user = useAuthStore((s) => s.user)

  const displayName = user?.name?.trim() || user?.email || ''
  const initial = displayName ? displayName.charAt(0).toUpperCase() : '?'

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600">
          <span className="text-sm font-medium text-white">{initial}</span>
        </div>
        <span className="text-sm text-slate-700">{displayName}</span>
      </div>
    </header>
  )
}
