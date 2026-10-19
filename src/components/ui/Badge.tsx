import { CheckCircle2, Clock, XCircle } from 'lucide-react'

type Icon = typeof Clock

const variants: Record<string, { cls: string; label: string; icon?: Icon }> = {
  pending:   { cls: 'badge-pending',  label: 'Pending',   icon: Clock },
  approved:  { cls: 'badge-accent',   label: 'Approved',  icon: CheckCircle2 },
  confirmed: { cls: 'badge-approved', label: 'Confirmed', icon: CheckCircle2 },
  denied:    { cls: 'badge-denied',   label: 'Denied',    icon: XCircle },
  cancelled: { cls: 'badge-denied',   label: 'Cancelled', icon: XCircle },
  paid:      { cls: 'badge-approved', label: 'Paid',      icon: CheckCircle2 },
  sent:      { cls: 'badge-pending',  label: 'Sent',      icon: Clock },
  draft:     { cls: 'badge-neutral',  label: 'Draft' },
  overdue:   { cls: 'badge-denied',   label: 'Overdue',   icon: XCircle },
  recurring: { cls: 'badge-recurring', label: '' },
  oneoff:    { cls: 'badge-oneoff',   label: 'One-off' },
}

export default function Badge({ status, label }: { status: string; label?: string }) {
  const v = variants[status] ?? { cls: 'badge-neutral', label: status }
  const Icon = v.icon
  return (
    <span className={`badge ${v.cls}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label ?? v.label}
    </span>
  )
}
