import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FolderKanban, Plus, ScrollText, Search, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useActiveWorkspace } from '../context/WorkspacesContext.jsx';

const ROLES = ['ADMIN', 'LEAD', 'MEMBER'];

export default function WorkspacePage() {
  const { wid } = useParams();
  useActiveWorkspace(wid);
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState(null);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState({ name: '', description: '' });
  const [member, setMember] = useState({ email: '', role: 'MEMBER' });
  const [error, setError] = useState('');

  const isAdmin = workspace?.myRole === 'ADMIN';
  const canCreateProject = isAdmin || workspace?.myRole === 'LEAD';

  const load = async () => {
    try {
      const [w, p] = await Promise.all([api.get(`/workspaces/${wid}`), api.get(`/workspaces/${wid}/projects`)]);
      setWorkspace(w.data.workspace);
      setProjects(p.data.projects);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    load();
  }, [wid]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const createProject = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/workspaces/${wid}/projects`, project);
      setProject({ name: '', description: '' });
    });
  };

  const addMember = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/workspaces/${wid}/members`, member);
      setMember({ email: '', role: 'MEMBER' });
    });
  };

  if (!workspace) return <p className="text-sm text-ink-700">{error || 'Loading…'}</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{workspace.name}</h1>
        <div className="flex items-center gap-2">
          <Link to={`/workspace/${wid}/search`} className="btn-ghost"><Search size={14} /> Search</Link>
          <Link to={`/workspace/${wid}/audit`} className="btn-ghost"><ScrollText size={14} /> Audit log</Link>
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">Your role: {workspace.myRole}</span>
        </div>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section>
        <h2 className="mb-3 font-semibold">Projects</h2>
        {canCreateProject && (
          <form onSubmit={createProject} className="mb-4 flex flex-wrap gap-2">
            <input className="input max-w-xs" required placeholder="Project name" value={project.name} onChange={(e) => setProject({ ...project, name: e.target.value })} />
            <input className="input max-w-sm" placeholder="Description (optional)" value={project.description} onChange={(e) => setProject({ ...project, description: e.target.value })} />
            <button className="btn-primary"><Plus size={16} /> New project</button>
          </form>
        )}
        {!projects.length ? (
          <p className="text-sm text-ink-700">No projects yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Link key={p.id} to={`/project/${p.id}`} className="card p-4 transition hover:border-brand-500">
                <h3 className="flex items-center gap-2 font-semibold"><FolderKanban size={16} className="text-brand-600" /> {p.name}</h3>
                {p.description && <p className="mt-1 line-clamp-2 text-xs text-ink-700">{p.description}</p>}
                <p className="mt-3 text-xs text-ink-700">{p.taskCount} tasks · health {p.health.score}% ({p.health.status.replace('_', ' ').toLowerCase()})</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Members</h2>
        {isAdmin && (
          <form onSubmit={addMember} className="mb-4 flex flex-wrap gap-2">
            <input className="input max-w-xs" type="email" required placeholder="Registered user's email" value={member.email} onChange={(e) => setMember({ ...member, email: e.target.value })} />
            <select className="input w-auto" value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <button className="btn-primary"><Plus size={16} /> Add member</button>
          </form>
        )}
        <div className="card divide-y divide-cream-200">
          {workspace.members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{m.name}{m.userId === user.id && <span className="ml-1 text-xs text-ink-700/60">(you)</span>}</p>
                <p className="text-xs text-ink-700">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <select
                    className="input w-auto py-1"
                    value={m.role}
                    onChange={(e) => run(() => api.patch(`/workspaces/${wid}/members/${m.userId}`, { role: e.target.value }))}
                  >
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                ) : (
                  <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs">{m.role}</span>
                )}
                {isAdmin && (
                  <button
                    aria-label="Remove member"
                    className="text-red-500 hover:text-red-700"
                    onClick={() => window.confirm(`Remove ${m.name}?`) && run(() => api.delete(`/workspaces/${wid}/members/${m.userId}`))}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
