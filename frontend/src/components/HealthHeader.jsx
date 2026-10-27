import { Activity, Sparkles } from 'lucide-react';

const STATUS_STYLE = {
  ON_TRACK: { label: 'On track', cls: 'bg-emerald-100 text-emerald-700' },
  AT_RISK: { label: 'At risk', cls: 'bg-amber-100 text-amber-800' },
  CRITICAL: { label: 'Critical', cls: 'bg-red-100 text-red-700' },
};

export default function HealthHeader({ health }) {
  const s = STATUS_STYLE[health.status];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Activity size={16} className="text-brand-600" /> Launch Health
          </h3>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
        </div>
        <p className="mt-3 text-4xl font-bold">{health.score}%</p>
      </div>
      <div className="card bg-ink-800 p-4 text-cream-50 md:col-span-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={16} className="text-brand-500" /> AI Brief
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-cream-100">{health.summary}</p>
        {health.aiBrief && <p className="mt-2 text-xs text-cream-200/80">{health.aiBrief}</p>}
      </div>
    </div>
  );
}
