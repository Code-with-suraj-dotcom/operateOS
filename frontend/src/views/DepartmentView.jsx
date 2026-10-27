import TaskCard from '../components/TaskCard.jsx';
import { CATEGORIES, CATEGORY_LABEL } from '../components/badges.jsx';

const COLUMN_ACCENT = { PRODUCT: 'bg-brand-500', ENGINEERING: 'bg-ink-800', MARKETING: 'bg-amber-500' };

export default function DepartmentView({ tasks, onOpen, onStatusChange }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {CATEGORIES.map((cat) => {
        const items = tasks.filter((t) => t.category === cat);
        return (
          <section key={cat} className="rounded-xl bg-cream-200/60 p-3">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${COLUMN_ACCENT[cat]}`} />
                {CATEGORY_LABEL[cat]}
              </h3>
              <span className="text-xs text-ink-700">{items.length}</span>
            </header>
            <div className="space-y-2">
              {items.map((t) => (
                <TaskCard key={t.id} task={t} onOpen={onOpen} onStatusChange={onStatusChange} />
              ))}
              {!items.length && <p className="py-6 text-center text-xs text-ink-700/60">No tasks</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
