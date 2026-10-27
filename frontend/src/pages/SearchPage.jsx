import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, FileText, MessagesSquare, Search } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';
import AuditRow from '../components/AuditRow.jsx';
import { useActiveWorkspace } from '../context/WorkspacesContext.jsx';
import { CATEGORIES, CATEGORY_LABEL, PriorityBadge, RiskBadge, STATUSES, STATUS_META, StatusBadge } from '../components/badges.jsx';

const TABS = [
  ['all', 'All'],
  ['task', 'Tasks'],
  ['doc', 'Documents'],
  ['audit', 'Audit log'],
];

export default function SearchPage() {
  const { wid } = useParams();
  useActiveWorkspace(wid);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('all');
  const [filters, setFilters] = useState({ department: '', status: '', atRisk: '', actorType: '' });
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const params = { q: debounced, type, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
    setError('');
    api
      .get(`/workspaces/${wid}/search`, { params })
      .then((r) => setResults(r.data))
      .catch((e) => setError(errorMessage(e)));
  }, [wid, debounced, type, filters]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const empty = results && !results.tasks.length && !results.docs.length && !results.audit.length;

  return (
    <div className="space-y-5">
      <div>
        <Link to={`/workspace/${wid}`} className="inline-flex items-center gap-1 text-xs text-ink-700 hover:text-brand-600">
          <ChevronLeft size={14} /> Workspace
        </Link>
        <h1 className="text-xl font-bold">Search</h1>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-ink-700/50" />
        <input className="input pl-9" autoFocus placeholder="Search tasks, briefs, transcripts and audit history…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-cream-200 bg-white p-1">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setType(key)} className={`rounded-md px-3 py-1.5 text-sm ${type === key ? 'bg-ink-800 text-cream-50' : 'text-ink-700 hover:bg-cream-100'}`}>
              {label}
            </button>
          ))}
        </div>
        <select className="input w-auto" value={filters.department} onChange={set('department')}>
          <option value="">Any department</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select className="input w-auto" value={filters.status} onChange={set('status')}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select className="input w-auto" value={filters.atRisk} onChange={set('atRisk')}>
          <option value="">Any risk state</option>
          <option value="true">At risk</option>
          <option value="false">Not at risk</option>
        </select>
        <select className="input w-auto" value={filters.actorType} onChange={set('actorType')}>
          <option value="">Any actor</option>
          <option value="HUMAN">Human</option>
          <option value="AI_AGENT">AI agent</option>
        </select>
      </div>
      <p className="text-xs text-ink-700/70">Department, status and risk filters apply to tasks; actor applies to the audit log. Using task filters in "All" shows tasks only.</p>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!results && !error && <div className="animate-pulse space-y-3"><div className="h-16 rounded bg-cream-200" /><div className="h-16 rounded bg-cream-200" /></div>}
      {empty && <p className="py-10 text-center text-sm text-ink-700/70">Nothing found.</p>}

      {results?.tasks.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Tasks ({results.counts.tasks})</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {results.tasks.map((t) => (
              <Link key={t.id} to={`/project/${t.projectId}`} className={`card p-3 hover:border-brand-500 ${t.isAtRisk ? 'border-amber-300' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{t.title}</p>
                  <PriorityBadge priority={t.priority} />
                </div>
                <p className="mt-1 text-xs text-ink-700">{CATEGORY_LABEL[t.category]} · {t.projectName}{t.assignee && ` · ${t.assignee}`}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge status={t.status} />
                  {t.isAtRisk && <RiskBadge reason={t.riskReason} />}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results?.docs.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Documents ({results.counts.docs})</h2>
          <div className="space-y-2">
            {results.docs.map((d) => (
              <Link key={d.id} to={`/project/${d.projectId}`} className="card block p-3 hover:border-brand-500">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {d.type === 'BRIEF' ? <FileText size={14} className="text-brand-600" /> : <MessagesSquare size={14} className="text-brand-600" />}
                  {d.title} <span className="text-xs font-normal text-ink-700">· {d.type === 'BRIEF' ? 'Brief' : 'Transcript'} by {d.author}</span>
                </p>
                <p className="mt-1 whitespace-pre-line text-xs text-ink-700">{d.snippet}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results?.audit.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Audit log ({results.counts.audit})</h2>
          <ul className="card divide-y divide-cream-200">{results.audit.map((l) => <AuditRow key={l.id} log={l} />)}</ul>
        </section>
      )}
    </div>
  );
}
