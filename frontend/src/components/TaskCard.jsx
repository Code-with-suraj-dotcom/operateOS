import { GitBranch, User } from 'lucide-react';
import { PriorityBadge, RiskBadge, STATUSES, STATUS_META, StatusBadge } from './badges.jsx';

export default function TaskCard({ task, onOpen, onStatusChange, showCategory = false }) {
  const blocked = task.status === 'BLOCKED';
  const border = blocked
    ? 'border-red-300 border-l-4 border-l-red-500'
    : task.isAtRisk
    ? 'border-amber-300 border-2'
    : 'border-cream-200';

  return (
    <div className={`rounded-lg border bg-white p-3 shadow-sm ${border}`} title={task.isAtRisk ? task.riskReason : undefined}>
      <button onClick={() => onOpen(task)} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold leading-snug">{task.title}</h4>
          <PriorityBadge priority={task.priority} />
        </div>
        {showCategory && <p className="mt-0.5 text-xs text-ink-700/70">{task.category}</p>}
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={task.status} />
        {task.isAtRisk && <RiskBadge reason={task.riskReason} />}
      </div>

      {blocked && task.blockerNote && <p className="mt-2 text-xs text-red-700">Blocker: {task.blockerNote}</p>}
      {task.isAtRisk && <p className="mt-2 text-xs text-amber-800">{task.riskReason}</p>}

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-700/80">
        <span className="inline-flex items-center gap-1" title="Upstream dependencies">
          <GitBranch size={12} /> {task.dependsOn.length} upstream
        </span>
        {task.assignee && (
          <span className="inline-flex items-center gap-1">
            <User size={12} /> {task.assignee.name}
          </span>
        )}
        <select
          aria-label="Change status"
          value={task.status}
          onChange={(e) => onStatusChange(task, e.target.value)}
          className="rounded border border-cream-200 bg-cream-50 px-1 py-0.5 text-xs"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
