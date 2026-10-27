import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';
import AuditRow from '../components/AuditRow.jsx';
import { useActiveWorkspace } from '../context/WorkspacesContext.jsx';

const ENTITY_TYPES = ['Task', 'AgentProposal', 'ContextDoc'];

export default function AuditPage() {
  const { wid } = useParams();
  useActiveWorkspace(wid);
  const [filters, setFilters] = useState({ actorType: '', entityType: '', projectId: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/workspaces/${wid}/projects`).then((r) => setProjects(r.data.projects)).catch(() => {});
  }, [wid]);

  useEffect(() => {
    setData(null);
    const params = { page, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
    api
      .get(`/workspaces/${wid}/audit`, { params })
      .then((r) => setData(r.data))
      .catch((e) => setError(errorMessage(e)));
  }, [wid, filters, page]);

  const set = (k) => (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: e.target.value }));
  };

  return (
    <div className="space-y-5">
      <div>
        <Link to={`/workspace/${wid}`} className="inline-flex items-center gap-1 text-xs text-ink-700 hover:text-brand-600">
          <ChevronLeft size={14} /> Workspace
        </Link>
        <h1 className="text-xl font-bold">Audit log</h1>
        <p className="text-sm text-ink-700">Append-only record of every human and AI action, with before/after state.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select className="input w-auto" value={filters.actorType} onChange={set('actorType')}>
          <option value="">All actors</option>
          <option value="HUMAN">Human</option>
          <option value="AI_AGENT">AI agent</option>
        </select>
        <select className="input w-auto" value={filters.entityType} onChange={set('entityType')}>
          <option value="">All entities</option>
          {ENTITY_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="input w-auto" value={filters.projectId} onChange={set('projectId')}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="card divide-y divide-cream-200">
        {!data ? (
          <div className="animate-pulse space-y-3 p-4"><div className="h-10 rounded bg-cream-200" /><div className="h-10 rounded bg-cream-200" /><div className="h-10 rounded bg-cream-200" /></div>
        ) : data.logs.length === 0 ? (
          <p className="p-10 text-center text-sm text-ink-700/70">No audit entries match these filters.</p>
        ) : (
          <ul className="divide-y divide-cream-200">{data.logs.map((l) => <AuditRow key={l.id} log={l} />)}</ul>
        )}
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-700">{data.total} entries · page {data.page} of {data.pages}</span>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="btn-ghost" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
