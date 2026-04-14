import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react'
import { useSyncExternalStore } from 'react'

interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'warning'
}

let toasts: ToastItem[] = []
let setToastsState: ((items: ToastItem[]) => void) | null = null
const listeners = new Set<() => void>()

function emit() {
  if (setToastsState) {
    setToastsState(toasts)
  }
  listeners.forEach((listener) => listener())
}

function addToast(type: ToastItem['type'], message: string) {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  const item: ToastItem = { id, message, type }
  toasts = [...toasts, item]
  emit()

  window.setTimeout(() => {
    removeToast(id)
  }, 3000)
}

function removeToast(id: string) {
  toasts = toasts.filter((toast) => toast.id !== id)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return toasts
}

export function useToast() {
  return {
    toast: {
      success: (message: string) => addToast('success', message),
      error: (message: string) => addToast('error', message),
      warning: (message: string) => addToast('warning', message),
    },
  }
}

export function ToastContainer() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  setToastsState = (nextItems: ToastItem[]) => {
    toasts = nextItems
  }

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
