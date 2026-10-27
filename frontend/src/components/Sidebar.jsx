import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Boxes, ChevronUp, FolderKanban, LogOut, PanelLeftClose, Plus, ScrollText, Search, Settings } from 'lucide-react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWorkspaces } from '../context/WorkspacesContext.jsx';

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';

const itemCls = ({ isActive }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
    isActive ? 'bg-brand-600 text-white' : 'text-cream-200 hover:bg-ink-700'
  }`;

const subCls = ({ isActive }) =>
  `flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition ${
    isActive ? 'bg-ink-700 text-white' : 'text-cream-200/80 hover:bg-ink-700/60'
  }`;

export default function Sidebar({ onNavigate, onClose }) {
  const { user, demoSessions, switchDemoRole, logout } = useAuth();
  const { workspaces, activeId } = useWorkspaces();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  // Projects of the workspace the user is currently in.
  useEffect(() => {
    if (!activeId) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    api
      .get(`/workspaces/${activeId}/projects`)
      .then((r) => !cancelled && setProjects(r.data.projects))
      .catch(() => !cancelled && setProjects([]));
    return () => {
      cancelled = true;
    };
  }, [activeId, location.pathname]);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <aside className="flex h-full w-64 flex-col bg-ink-800 text-cream-50">
      <div className="flex items-center justify-between pr-3">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-2 px-5 py-4 text-lg font-semibold">
          <Boxes size={22} className="text-brand-500" /> OperateOS
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            title="Close sidebar"
            aria-label="Close sidebar"
            className="rounded-lg p-1.5 text-cream-200/70 hover:bg-ink-700 hover:text-white"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="mb-2 flex items-center justify-between px-3 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cream-200/60">Workspaces</p>
          <Link to="/" onClick={onNavigate} title="New workspace" className="rounded p-1 text-cream-200/70 hover:bg-ink-700 hover:text-white">
            <Plus size={14} />
          </Link>
        </div>

        {workspaces === null ? (
          <div className="animate-pulse space-y-2 px-3">
            <div className="h-8 rounded bg-ink-700" />
            <div className="h-8 rounded bg-ink-700" />
          </div>
        ) : workspaces.length === 0 ? (
          <p className="px-3 text-xs text-cream-200/60">No workspaces yet.</p>
        ) : (
          <ul className="space-y-1">
            {workspaces.map((w) => {
              const active = w.id === activeId;
              return (
                <li key={w.id}>
                  <NavLink
                    to={`/workspace/${w.id}`}
                    end
                    onClick={onNavigate}
                    className={() => itemCls({ isActive: active })}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink-700 text-xs font-semibold text-cream-50">
                      {initials(w.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{w.name}</span>
                    {w.isDemo && <span className="rounded bg-ink-700 px-1.5 text-[10px] text-cream-200">demo</span>}
                  </NavLink>

                  {active && (
                    <div className="ml-4 mt-1 space-y-0.5 border-l border-ink-700 pl-3">
                      {projects.map((p) => (
                        <NavLink key={p.id} to={`/project/${p.id}`} onClick={onNavigate} className={subCls}>
                          <FolderKanban size={13} /> <span className="truncate">{p.name}</span>
                        </NavLink>
                      ))}
                      <NavLink to={`/workspace/${w.id}/search`} onClick={onNavigate} className={subCls}>
                        <Search size={13} /> Search
                      </NavLink>
                      <NavLink to={`/workspace/${w.id}/audit`} onClick={onNavigate} className={subCls}>
                        <ScrollText size={13} /> Audit log
                      </NavLink>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Account */}
      <div className="relative border-t border-ink-700 p-3">
        {menuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-ink-700 bg-ink-900 p-2 shadow-xl">
            {demoSessions && (
              <div className="mb-2 rounded-lg bg-ink-800 p-2">
                <p className="mb-1.5 px-1 text-[11px] uppercase tracking-wider text-cream-200/60">Demo role</p>
                <div className="flex gap-1">
                  {demoSessions.map((s) => (
                    <button
                      key={s.role}
                      onClick={() => {
                        switchDemoRole(s.role);
                        window.location.reload();
                      }}
                      className={`flex-1 rounded-md px-1.5 py-1 text-xs ${
                        user.email === s.user.email ? 'bg-brand-600 text-white' : 'text-cream-200 hover:bg-ink-700'
                      }`}
                    >
                      {s.role}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <NavLink to="/account" onClick={onNavigate} className={itemCls}>
              <Settings size={15} /> Account settings
            </NavLink>
            <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-ink-700">
              <LogOut size={15} /> Log out
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-ink-700"
          aria-expanded={menuOpen}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
            {initials(user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-cream-200/70">{user.email}</span>
          </span>
          <ChevronUp size={16} className={`shrink-0 text-cream-200/70 transition ${menuOpen ? '' : 'rotate-180'}`} />
        </button>
      </div>
    </aside>
  );
}
