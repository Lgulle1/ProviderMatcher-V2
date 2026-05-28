import {
  BarChart2,
  Globe,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Settings,
  SlidersHorizontal,
  Stethoscope,
  Table,
  Tag,
  Users,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { signOut } from '../../hooks/useAuth'

function navLinkClassName({ isActive }: { isActive: boolean }) {
  return [
    'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors',
    isActive
      ? 'bg-indigo-50 text-indigo-700 font-medium'
      : 'text-slate-600 hover:bg-slate-50',
  ].join(' ')
}

export default function Sidebar() {
  const org = useAuthStore((s) => s.org)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white">
      <div className="px-6 py-5 border-b border-slate-200">
        <span className="text-xl font-bold text-indigo-600">ProviderMatcher</span>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto py-4">
        <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">
          DATA
        </div>
        <NavLink to="/dashboard" className={navLinkClassName} end>
          <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
          Dashboard
        </NavLink>
        <NavLink to="/analytics" className={navLinkClassName}>
          <BarChart2 className="h-4 w-4 shrink-0" aria-hidden />
          Analytics
        </NavLink>
        <NavLink to="/providers" className={navLinkClassName}>
          <Users className="h-4 w-4 shrink-0" aria-hidden />
          Providers
        </NavLink>
        <NavLink to="/data-table" className={navLinkClassName}>
          <Table className="h-4 w-4 shrink-0" aria-hidden />
          Data Table
        </NavLink>

        <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">
          CONFIGURATION
        </div>
        <NavLink to="/locations" className={navLinkClassName}>
          <MapPin className="h-4 w-4 shrink-0" aria-hidden />
          Locations
        </NavLink>
        <NavLink to="/case-types" className={navLinkClassName}>
          <Stethoscope className="h-4 w-4 shrink-0" aria-hidden />
          Case Types
        </NavLink>
        <NavLink to="/categories" className={navLinkClassName}>
          <Tag className="h-4 w-4 shrink-0" aria-hidden />
          Categories
        </NavLink>
        <NavLink to="/constraints" className={navLinkClassName}>
          <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
          Constraints
        </NavLink>
        <NavLink to="/questions" className={navLinkClassName}>
          <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />
          Questions
        </NavLink>

        <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">
          WIDGETS
        </div>
        <NavLink to="/widgets" className={navLinkClassName}>
          <Globe className="h-4 w-4 shrink-0" aria-hidden />
          My Widgets
        </NavLink>

        <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">
          ACCOUNT
        </div>
        <NavLink to="/settings" className={navLinkClassName}>
          <Settings className="h-4 w-4 shrink-0" aria-hidden />
          Settings
        </NavLink>
      </nav>

      <div className="border-t border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-700">{org?.name ?? ''}</p>
        <p className="text-xs text-slate-500 mt-0.5">{user?.name ?? ''}</p>
        <button
          type="button"
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mt-3 w-full"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
