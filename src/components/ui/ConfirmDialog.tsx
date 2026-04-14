import LoadingSpinner from './LoadingSpinner'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
  confirmDisabled?: boolean
  children?: React.ReactNode
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  isLoading = false,
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  if (!isOpen) {
    return null
  }

  const confirmClass =
    confirmVariant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-indigo-600 hover:bg-indigo-700 text-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={() => onCancel()}>
      <div
        className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600">{message}</p>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mb-6" />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading || confirmDisabled}
            className={[
              'rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50',
              confirmClass,
            ].join(' ')}
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <LoadingSpinner size="sm" className="border-white border-t-transparent" />
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
