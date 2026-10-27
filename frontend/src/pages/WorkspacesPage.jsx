import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';
import { useActiveWorkspace, useWorkspaces } from '../context/WorkspacesContext.jsx';

export default function WorkspacesPage() {
  useActiveWorkspace(null);
  const { refresh: refreshSidebar } = useWorkspaces();
  const [workspaces, setWorkspaces] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = () =>
    api
      .get('/workspaces')
      .then((r) => setWorkspaces(r.data.workspaces))
      .catch((e) => setError(errorMessage(e)));

  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/workspaces', { name });
      setName('');
      load();
      refreshSidebar();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Your workspaces</h1>

      <form onSubmit={create} className="mb-6 flex gap-2">
        <input className="input max-w-xs" required placeholder="New workspace name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary">
          <Plus size={16} /> Create
        </button>
      </form>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!workspaces ? (
        <p className="text-sm text-ink-700">Loading…</p>
      ) : !workspaces.length ? (
        <p className="text-sm text-ink-700">No workspaces yet. Create one above.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((w) => (
            <Link key={w.id} to={`/workspace/${w.id}`} className="card p-4 transition hover:border-brand-500">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold">{w.name}</h3>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{w.myRole}</span>
              </div>
              <p className="mt-3 flex items-center gap-1 text-xs text-ink-700">
                <Users size={12} /> {w.memberCount} member{w.memberCount === 1 ? '' : 's'}
                {w.isDemo && <span className="ml-2 rounded bg-cream-200 px-1.5 py-0.5">demo</span>}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
