import clsx from 'clsx'
import { useTheme } from '../../context/ThemeContext'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}

export default function Button({ variant = 'primary', size = 'md', loading, children, className, ...props }: ButtonProps) {
  const { accent } = useTheme()

  const base = 'inline-flex items-center gap-2 font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed'

  const variantClasses: Record<Variant, string> = {
    primary: 'text-white shadow-sm hover:opacity-90 active:scale-95',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm active:scale-95',
    ghost: 'text-gray-600 hover:bg-gray-100 active:scale-95',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm active:scale-95',
  }

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={clsx(base, sizeClasses[size], variantClasses[variant], className)}
      style={variant === 'primary' ? { backgroundColor: accent, ...props.style } : props.style}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
