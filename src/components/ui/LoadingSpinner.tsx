interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClass =
    size === 'sm'
      ? 'h-4 w-4 border-2'
      : size === 'lg'
        ? 'h-12 w-12 border-4'
        : 'h-8 w-8 border-2'

  return (
    <div
      className={[
        'animate-spin rounded-full border-indigo-600 border-t-transparent',
        sizeClass,
        className,
      ].join(' ')}
    />
  )
}
