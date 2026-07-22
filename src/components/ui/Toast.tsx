import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { getSnapshot, removeToast, subscribe } from './toastStore'

export function ToastContainer() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={[
            'pointer-events-auto flex min-w-72 max-w-sm items-center gap-3 rounded-xl border-l-4 bg-white px-4 py-3 shadow-lg',
            item.type === 'success'
              ? 'border-l-green-500'
              : item.type === 'error'
                ? 'border-l-red-500'
                : 'border-l-yellow-500',
          ].join(' ')}
        >
          {item.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : item.type === 'error' ? (
            <XCircle className="h-5 w-5 text-red-500" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          )}
          <p className="flex-1 text-sm text-slate-700">{item.message}</p>
          <button
            type="button"
            onClick={() => removeToast(item.id)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
