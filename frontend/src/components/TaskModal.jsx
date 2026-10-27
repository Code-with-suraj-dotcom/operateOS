import { useState } from 'react';
import { X } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, STATUSES, STATUS_META } from './badges.jsx';

/**
 * Create (task = null) or edit a task.
 * MEMBERs may only edit status + blocker note; everything else is read-only for them.
 */
export default function TaskModal({ projectId, task, tasks, members, canManage, onClose, onSaved }) {
  const isEdit = !!task;
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    category: task?.category || 'ENGINEERING',
    priority: task?.priority || 'MEDIUM',
    status: task?.status || 'TODO',
    assignee: task?.assignee?.id || '',
    blockerNote: task?.blockerNote || '',
    dependsOn: task?.dependsOn || [],
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const lockOthers = isEdit && !canManage;
  const depOptions = tasks.filter((t) => t.id !== task?.id);

  const toggleDep = (id) =>
    setForm((f) => ({
      ...f,
      dependsOn: f.dependsOn.includes(id) ? f.dependsOn.filter((d) => d !== id) : [...f.dependsOn, id],
    }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        const body = canManage
          ? {
              title: form.title,
              description: form.description,
              category: form.category,
              priority: form.priority,
              status: form.status,
              assignee: form.assignee || null,
              blockerNote: form.blockerNote,
            }
          : { status: form.status, blockerNote: form.blockerNote };
        await api.patch(`/tasks/${task.id}`, body);
      } else {
        await api.post(`/projects/${projectId}/tasks`, { ...form, assignee: form.assignee || null });
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  async function archive() {
    if (!window.confirm('Archive this task? It will be removed from the board and from other tasks’ dependencies.')) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
      <form onSubmit={submit} className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isEdit ? 'Task details' : 'New task'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-700 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        {lockOthers && (
          <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            As a MEMBER you can update the status and blocker note only.
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input className="input" required disabled={lockOthers} value={form.title} onChange={set('title')} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={3} disabled={lockOthers} value={form.description} onChange={set('description')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Department</label>
              <select className="input" disabled={lockOthers} value={form.category} onChange={set('category')}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" disabled={lockOthers} value={form.priority} onChange={set('priority')}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={set('status')}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Assignee</label>
              <select className="input" disabled={lockOthers} value={form.assignee} onChange={set('assignee')}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {form.status === 'BLOCKED' && (
            <div>
              <label className="label">Blocker note</label>
              <input className="input" value={form.blockerNote} onChange={set('blockerNote')} placeholder="What is blocking this task?" />
            </div>
          )}

          {!isEdit && depOptions.length > 0 && (
            <div>
              <label className="label">Depends on (upstream tasks)</label>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-cream-200 p-2">
                {depOptions.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.dependsOn.includes(t.id)} onChange={() => toggleDep(t.id)} />
                    {t.title}
                  </label>
                ))}
              </div>
            </div>
          )}
          {isEdit && (
            <p className="text-xs text-ink-700/70">
              Upstream dependencies: {task.dependsOn.length}. Editing dependencies arrives with the dependency engine.
            </p>
          )}
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex items-center justify-between">
          {isEdit && canManage ? (
            <button type="button" onClick={archive} className="text-sm text-red-600 hover:underline">
              Archive task
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create task'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
