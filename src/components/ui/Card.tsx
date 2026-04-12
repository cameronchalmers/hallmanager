import type { CSSProperties } from 'react'

export default function Card({ children, className, style }: { children: React.ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`card ${className ?? ''}`} style={style}>
      {children}
    </div>
  )
}
