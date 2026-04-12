import { useTheme } from '../../context/ThemeContext'

type Variant = 'primary' | 'ghost' | 'soft' | 'danger' | 'qf'
type Size = 'sm' | 'md'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export default function Button({ variant = 'primary', size = 'md', loading, children, style, ...props }: ButtonProps) {
  const { accent } = useTheme()

  const cls = `btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''}`

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`${cls} ${props.className ?? ''}`}
      style={variant === 'primary' ? { background: accent, ...style } : style}
    >
      {loading && (
        <svg style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none">
          <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
