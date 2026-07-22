/**
 * Toast store and the hook that raises toasts.
 *
 * Kept separate from Toast.tsx so that file exports only a component — mixing
 * component and non-component exports breaks React Fast Refresh, which is what
 * react-refresh/only-export-components warns about.
 */

export interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'warning'
}

/** How long a toast stays up before dismissing itself. */
export const TOAST_TIMEOUT_MS = 3000

let toasts: ToastItem[] = []
const listeners = new Set<() => void>()

function emit() {
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
  }, TOAST_TIMEOUT_MS)
}

export function removeToast(id: string) {
  toasts = toasts.filter((toast) => toast.id !== id)
  emit()
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot() {
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
