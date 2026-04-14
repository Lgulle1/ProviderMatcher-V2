import Sidebar from './Sidebar'
import TopBar from './TopBar'

interface AppLayoutProps {
  children: React.ReactNode
  title: string
}

export default function AppLayout({ children, title }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
      </div>
    </div>
  )
}
