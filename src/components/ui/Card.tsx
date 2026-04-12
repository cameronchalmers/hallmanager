import clsx from 'clsx'
import type { CSSProperties } from 'react'

export default function Card({ children, className, style }: { children: React.ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={clsx('bg-white rounded-xl border border-gray-100 shadow-sm', className)} style={style}>
      {children}
    </div>
  )
}
