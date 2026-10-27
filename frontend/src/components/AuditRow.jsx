import { useState } from 'react';
import { Bot, ChevronDown, ChevronRight, User } from 'lucide-react';

const pretty = (s) => s.toLowerCase().replace(/_/g, ' ');

function Json({ label, value, tone }) {
  if (value === null || value === undefined) return null;
  return (
    <div className={`rounded-lg p-2 ${tone}`}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export function ActorBadge({ type }) {
  const ai = type === 'AI_AGENT';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        ai ? 'bg-brand-100 text-brand-700' : 'bg-cream-200 text-ink-700'
      }`}
    >
      {ai ? <Bot size={12} /> : <User size={12} />} {ai ? 'AI agent' : 'Human'}
    </span>
  );
}

/** One audit entry with an expandable before/after diff. */
export default function AuditRow({ log }) {
  const [open, setOpen] = useState(false);
  const { before, after, note } = log.details || {};
  const hasDetails = before != null || after != null || note;

  return (
    <li className="px-4 py-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left" disabled={!hasDetails}>
        <span className="mt-0.5 text-ink-700/60">{hasDetails ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span className="inline-block w-3.5" />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold capitalize">{pretty(log.action)}</span>
            {log.entityLabel && <span className="text-ink-700"> · {log.entityLabel}</span>}
            {!log.entityLabel && <span className="text-ink-700"> · {log.entityType}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-700">
            <ActorBadge type={log.actorType} />
            <span>{log.actorType === 'AI_AGENT' ? `approved by ${log.actorName}` : log.actorName}</span>
            {log.projectName && <span>· {log.projectName}</span>}
            <span>· {new Date(log.createdAt).toLocaleString()}</span>
          </p>
        </div>
      </button>
      {open && (
        <div className="ml-6 mt-3 space-y-2">
          {note && <p className="text-xs text-ink-700">{note}</p>}
          <div className="grid gap-2 md:grid-cols-2">
            <Json label="Before" value={before} tone="bg-red-50 text-red-900" />
            <Json label="After" value={after} tone="bg-emerald-50 text-emerald-900" />
          </div>
        </div>
      )}
    </li>
  );
}
