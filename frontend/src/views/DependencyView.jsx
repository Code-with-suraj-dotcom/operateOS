import { ArrowRight } from 'lucide-react';
import { RiskBadge, StatusBadge } from '../components/badges.jsx';

function Chips({ tasks, empty, onOpen }) {
  if (!tasks.length) return <span className="text-xs text-ink-700/50">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tasks.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t)}
          className="inline-flex items-center gap-1 rounded-md border border-cream-200 bg-cream-50 px-2 py-0.5 text-xs hover:border-brand-500"
        >
          {t.title}
          <StatusBadge status={t.status} />
        </button>
      ))}
    </div>
  );
}

export default function DependencyView({ tasks, onOpen }) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const upstreamOf = (t) => t.dependsOn.map((id) => byId.get(id)).filter(Boolean);
  const downstreamOf = (t) => tasks.filter((o) => o.dependsOn.includes(t.id));

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-cream-200 bg-cream-50 text-xs uppercase tracking-wide text-ink-700">
          <tr>
            <th className="px-4 py-3">Blocked by (upstream)</th>
            <th className="w-8" />
            <th className="px-4 py-3">Task</th>
            <th className="w-8" />
            <th className="px-4 py-3">Blocks (downstream)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cream-200">
          {tasks.map((t) => (
            <tr key={t.id} className="align-top">
              <td className="px-4 py-3">
                <Chips tasks={upstreamOf(t)} empty="No upstream" onOpen={onOpen} />
              </td>
              <td className="text-ink-700/40">
                <ArrowRight size={14} />
              </td>
              <td className="px-4 py-3">
                <button onClick={() => onOpen(t)} className="text-left font-semibold hover:text-brand-600">
                  {t.title}
                </button>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <StatusBadge status={t.status} />
                  {t.isAtRisk && <RiskBadge reason={t.riskReason} />}
                </div>
              </td>
              <td className="text-ink-700/40">
                <ArrowRight size={14} />
              </td>
              <td className="px-4 py-3">
                <Chips tasks={downstreamOf(t)} empty="No downstream" onOpen={onOpen} />
              </td>
            </tr>
          ))}
          {!tasks.length && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-700/60">
                No tasks yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
