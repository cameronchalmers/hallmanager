import clsx from 'clsx'

type Variant = 'pending' | 'confirmed' | 'denied' | 'approved' | 'cancelled' | 'paid' | 'sent' | 'draft' | 'overdue' | 'neutral'

const variants: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  denied: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-gray-100 text-gray-600 border-gray-200',
}

export default function Badge({ status, label }: { status: Variant | string; label?: string }) {
  const cls = variants[status] ?? variants.neutral
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', cls)}>
      {label ?? status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
