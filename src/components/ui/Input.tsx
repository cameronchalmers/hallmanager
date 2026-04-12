import clsx from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export default function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-gray-700">{label}</label>}
      <input
        {...props}
        className={clsx(
          'w-full px-3 py-2 text-sm border rounded-lg bg-white text-gray-900 placeholder:text-gray-400 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          error ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-purple-200 focus:border-purple-400',
          className
        )}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
