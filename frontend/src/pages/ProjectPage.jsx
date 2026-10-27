import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bot, ChevronLeft, Columns3, FileText, LayoutGrid, Network, Plus, ScrollText, Search } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';
import { useActiveWorkspace } from '../context/WorkspacesContext.jsx';
import HealthHeader from '../components/HealthHeader.jsx';
import TaskModal from '../components/TaskModal.jsx';
import ContextDrawer from '../components/ContextDrawer.jsx';
import ProposalsDrawer from '../components/ProposalsDrawer.jsx';
import DepartmentView from '../views/DepartmentView.jsx';
import KanbanView from '../views/KanbanView.jsx';
import DependencyView from '../views/DependencyView.jsx';

const VIEWS = [
  { key: 'department', label: 'Departments', Icon: LayoutGrid },
  { key: 'kanban', label: 'Status', Icon: Columns3 },
  { key: 'dependency', label: 'Dependencies', Icon: Network },
];
const VIEW_KEY = 'operateos_view';

export default function ProjectPage() {
  const { pid } = useParams();
  const [data, setData] = useState(null); // { project, workspace, myRole }
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState(localStorage.getItem(VIEW_KEY) || 'department');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null); // null | { task: Task | null }
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState(null); // null | { type: 'context' } | { type: 'proposals', focusId? }
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [p, t, pr] = await Promise.all([
        api.get(`/projects/${pid}`),
        api.get(`/projects/${pid}/tasks`),
        api.get(`/projects/${pid}/proposals`, { params: { status: 'PENDING' } }),
      ]);
      setData(p.data);
      setTasks(t.data.tasks);
      setPendingCount(pr.data.proposals.length);
      const w = await api.get(`/workspaces/${p.data.workspace.id}`);
      setMembers(w.data.workspace.members);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [pid]);

  useEffect(() => {
    load();
  }, [load]);

  const changeView = (v) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  useActiveWorkspace(data?.workspace.id);

  const canManage = data && (data.myRole === 'ADMIN' || data.myRole === 'LEAD');

  async function changeStatus(task, status) {
    setError('');
    try {
      await api.patch(`/tasks/${task.id}`, { status });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks;
  }, [tasks, query]);

  if (!data) return <p className="text-sm text-ink-700">{error || 'Loading…'}</p>;

  const viewProps = { tasks: visible, onOpen: (task) => setModal({ task }), onStatusChange: changeStatus };

  return (
    <div className="space-y-5">
      <div>
        <Link to={`/workspace/${data.workspace.id}`} className="inline-flex items-center gap-1 text-xs text-ink-700 hover:text-brand-600">
          <ChevronLeft size={14} /> {data.workspace.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{data.project.name}</h1>
            {data.project.description && <p className="text-sm text-ink-700">{data.project.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/workspace/${data.workspace.id}/search`} className="btn-ghost"><Search size={14} /> Search</Link>
            <Link to={`/workspace/${data.workspace.id}/audit`} className="btn-ghost"><ScrollText size={14} /> Audit log</Link>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">Your role: {data.myRole}</span>
          </div>
        </div>
      </div>

      <HealthHeader health={data.project.health} />

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-cream-200 bg-white p-1">
          {VIEWS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => changeView(key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
                view === key ? 'bg-ink-800 text-cream-50' : 'text-ink-700 hover:bg-cream-100'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-ink-700/50" />
            <input className="input w-48 pl-8" placeholder="Filter tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className="btn-ghost" onClick={() => setDrawer({ type: 'context' })}>
            <FileText size={16} /> Add brief / transcript
          </button>
          <button className="btn-ghost relative" onClick={() => setDrawer({ type: 'proposals' })}>
            <Bot size={16} /> AI proposals
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">{pendingCount}</span>
            )}
          </button>
          {canManage && (
            <button className="btn-primary" onClick={() => setModal({ task: null })}>
              <Plus size={16} /> New task
            </button>
          )}
        </div>
      </div>

      {view === 'department' && <DepartmentView {...viewProps} />}
      {view === 'kanban' && <KanbanView {...viewProps} />}
      {view === 'dependency' && <DependencyView {...viewProps} />}

      {drawer?.type === 'context' && (
        <ContextDrawer
          projectId={pid}
          onClose={() => setDrawer(null)}
          onProposal={(proposal) => {
            setDrawer({ type: 'proposals', focusId: proposal.id });
            load();
          }}
        />
      )}
      {drawer?.type === 'proposals' && (
        <ProposalsDrawer
          projectId={pid}
          canReview={canManage}
          focusId={drawer.focusId}
          onClose={() => setDrawer(null)}
          onChanged={load}
        />
      )}

      {modal && (
        <TaskModal
          projectId={pid}
          task={modal.task}
          tasks={tasks}
          members={members}
          canManage={canManage}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
