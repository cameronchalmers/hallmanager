import clsx from 'clsx'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

export default function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-gray-700">{label}</label>}
      <select
        {...props}
        className={clsx(
          'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400',
          className
        )}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
