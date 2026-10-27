import { useState } from 'react';
import { FileText, MessagesSquare, Sparkles, X } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';

const MODES = {
  brief: {
    label: 'Launch brief',
    Icon: FileText,
    intro:
      'Paste a messy launch brief. AI will propose tasks, priorities and dependencies. Nothing changes on the board until a Lead or Admin approves the proposal.',
    field: 'Launch brief',
    titlePlaceholder: 'e.g. Q4 mobile launch brief',
    placeholder: 'Paste or write your product launch brief here…',
    button: 'Generate plan',
    busy: 'Decomposing your brief into a dependency-linked plan…',
    sample: `Launch plan for the v2 mobile app.
- Write acceptance criteria for the launch release
- Build the notification service so users get launch alerts
- Design the push notification opt-in flow (depends on the notification service)
- Prepare launch creatives and the announcement email
- Publish an app store listing once notifications ship`,
  },
  transcript: {
    label: 'Meeting transcript',
    Icon: MessagesSquare,
    intro:
      'Paste standup or meeting notes. AI compares them with your existing tasks and proposes status updates, new action items and dependency links. Nothing changes until a Lead or Admin approves.',
    field: 'Meeting transcript',
    titlePlaceholder: 'e.g. Monday standup',
    placeholder: 'Paste raw meeting notes or a transcript here…',
    button: 'Extract actions',
    busy: 'Matching the meeting against your existing tasks…',
    sample: `Standup - Monday
Priya: Auth service is unblocked now, the OAuth credentials arrived and I'm working on it.
Rahul: I started on the Payments API. Launch creatives are done.
Meera: Landing page depends on the launch creatives, so let's link those.
Rahul: We need to add a load testing task for the Payments API before launch.
Sam: Mobile onboarding is stuck, waiting on the legal team for the privacy text.`,
  },
};

function Skeleton({ text }) {
  return (
    <div className="animate-pulse space-y-3" aria-label="Generating proposal">
      <div className="h-4 w-2/3 rounded bg-cream-200" />
      <div className="h-16 rounded bg-cream-200" />
      <div className="h-16 rounded bg-cream-200" />
      <div className="h-16 rounded bg-cream-200" />
      <p className="text-center text-xs text-ink-700">{text}</p>
    </div>
  );
}

export default function ContextDrawer({ projectId, initialMode = 'brief', onClose, onProposal }) {
  const [mode, setMode] = useState(initialMode);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const m = MODES[mode];

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/context/${mode}`, { title, content });
      onProposal(data.proposal);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink-900/40">
      <form onSubmit={submit} className="flex h-full w-full max-w-lg flex-col bg-cream-50 shadow-xl">
        <header className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
          <h2 className="font-semibold">Add context</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-700 hover:text-ink-900">
            <X size={18} />
          </button>
        </header>

        <div className="flex gap-1 border-b border-cream-200 px-5 pt-3">
          {Object.entries(MODES).map(([key, { label, Icon }]) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => {
                setMode(key);
                setError('');
              }}
              className={`flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-sm ${
                mode === key ? 'bg-white font-semibold shadow-sm' : 'text-ink-700'
              }`}
            >
              <Icon size={14} className="text-brand-600" /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {busy ? (
            <Skeleton text={m.busy} />
          ) : (
            <>
              <p className="text-sm text-ink-700">{m.intro}</p>
              <div>
                <label className="label">Title (optional)</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={m.titlePlaceholder} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="label">{m.field}</label>
                  <button type="button" onClick={() => setContent(m.sample)} className="mb-1 text-xs text-brand-600 hover:underline">
                    Use sample {mode === 'brief' ? 'brief' : 'transcript'}
                  </button>
                </div>
                <textarea
                  className="input font-mono text-xs"
                  rows={14}
                  required
                  minLength={20}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={m.placeholder}
                />
              </div>
            </>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-cream-200 px-5 py-4">
          <button type="button" onClick={onClose} className="btn-ghost" disabled={busy}>Cancel</button>
          <button className="btn-primary" disabled={busy || content.trim().length < 20}>
            <Sparkles size={16} /> {busy ? 'Working…' : m.button}
          </button>
        </footer>
      </form>
    </div>
  );
}
