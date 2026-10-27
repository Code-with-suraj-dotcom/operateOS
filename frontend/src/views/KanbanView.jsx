import TaskCard from '../components/TaskCard.jsx';
import { STATUSES, STATUS_META } from '../components/badges.jsx';

export default function KanbanView({ tasks, onOpen, onStatusChange }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {STATUSES.map((status) => {
        const items = tasks.filter((t) => t.status === status);
        return (
          <section key={status} className="rounded-xl bg-cream-200/60 p-3">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{STATUS_META[status].label}</h3>
              <span className="text-xs text-ink-700">{items.length}</span>
            </header>
            <div className="space-y-2">
              {items.map((t) => (
                <TaskCard key={t.id} task={t} showCategory onOpen={onOpen} onStatusChange={onStatusChange} />
              ))}
              {!items.length && <p className="py-6 text-center text-xs text-ink-700/60">No tasks</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
