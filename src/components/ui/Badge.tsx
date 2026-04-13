const variants: Record<string, { cls: string; label: string }> = {
  pending:   { cls: 'badge-pending',  label: '⏳ Pending' },
  approved:  { cls: 'badge-accent',   label: '✓ Approved' },
  confirmed: { cls: 'badge-approved', label: '✓ Confirmed' },
  denied:    { cls: 'badge-denied',   label: '✗ Denied' },
  cancelled: { cls: 'badge-denied',   label: '✗ Cancelled' },
  paid:      { cls: 'badge-approved', label: '✓ Paid' },
  sent:      { cls: 'badge-pending',  label: '⏳ Sent' },
  draft:     { cls: 'badge-neutral',  label: 'Draft' },
  overdue:   { cls: 'badge-denied',   label: '✗ Overdue' },
  recurring: { cls: 'badge-recurring', label: '' },
  oneoff:    { cls: 'badge-oneoff',   label: 'One-off' },
}

export default function Badge({ status, label }: { status: string; label?: string }) {
  const v = variants[status] ?? { cls: 'badge-neutral', label: status }
  return (
    <span className={`badge ${v.cls}`}>
      {label ?? v.label}
    </span>
  )
}
