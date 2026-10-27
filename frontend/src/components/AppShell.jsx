import { useState } from 'react';
import { Boxes, Menu, PanelLeftOpen } from 'lucide-react';
import Sidebar from './Sidebar.jsx';

const KEY = 'operateos_sidebar_closed';

/** Left sidebar + scrolling content area. Desktop: can be closed/opened (remembered). Mobile: slide-over drawer. */
export default function AppShell({ children }) {
  const [drawer, setDrawer] = useState(false); // mobile drawer
  const [closed, setClosed] = useState(() => localStorage.getItem(KEY) === '1'); // desktop collapse

  const setDesktopClosed = (value) => {
    setClosed(value);
    localStorage.setItem(KEY, value ? '1' : '0');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      {!closed && (
        <div className="hidden md:block">
          <Sidebar onClose={() => setDesktopClosed(true)} />
        </div>
      )}

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0">
            <Sidebar onNavigate={() => setDrawer(false)} onClose={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 bg-ink-800 px-4 py-3 text-cream-50 md:hidden">
          <button onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <span className="flex items-center gap-2 font-semibold">
            <Boxes size={18} className="text-brand-500" /> OperateOS
          </span>
        </header>

        <main className="relative flex-1 overflow-y-auto">
          {closed && (
            <button
              onClick={() => setDesktopClosed(false)}
              title="Open sidebar"
              aria-label="Open sidebar"
              className="absolute left-3 top-3 z-10 hidden items-center gap-1.5 rounded-lg bg-ink-800 px-2.5 py-2 text-xs text-cream-50 shadow hover:bg-ink-700 md:flex"
            >
              <PanelLeftOpen size={16} /> Menu
            </button>
          )}
          <div className={`mx-auto max-w-7xl px-4 py-6 md:px-8 ${closed ? 'md:pt-14' : ''}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
