import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, OctagonX } from 'lucide-react';

export const STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'];
export const CATEGORIES = ['PRODUCT', 'ENGINEERING', 'MARKETING'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const CATEGORY_LABEL = { PRODUCT: 'Product', ENGINEERING: 'Engineering', MARKETING: 'Marketing' };

export const STATUS_META = {
  TODO: { label: 'Todo', cls: 'bg-gray-100 text-gray-700', Icon: CircleDashed },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700', Icon: Loader2 },
  BLOCKED: { label: 'Blocked', cls: 'bg-red-100 text-red-700', Icon: OctagonX },
  DONE: { label: 'Done', cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
};

const PRIORITY_CLS = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-sky-100 text-sky-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-rose-100 text-rose-700',
};

export function StatusBadge({ status }) {
  const { label, cls, Icon } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon size={12} /> {label}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_CLS[priority]}`}>{priority}</span>;
}

export function RiskBadge({ reason }) {
  return (
    <span
      title={reason}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
    >
      <AlertTriangle size={12} /> At risk
    </span>
  );
}
