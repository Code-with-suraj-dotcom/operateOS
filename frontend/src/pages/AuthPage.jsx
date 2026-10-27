import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Boxes, Rocket } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { login, register, loadDemo } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function demo() {
    setBusy(true);
    setError('');
    try {
      const { projectId } = await loadDemo();
      navigate(`/project/${projectId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800">
            <Boxes className="text-brand-500" />
          </div>
          <h1 className="text-2xl font-bold">OperateOS</h1>
          <p className="text-sm text-ink-700">AI Operating System for Teams</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <h2 className="text-lg font-semibold">{isLogin ? 'Log in' : 'Create your account'}</h2>
          {!isLogin && (
            <div>
              <label className="label">Name</label>
              <input className="input" required value={form.name} onChange={set('name')} />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={form.email} onChange={set('email')} />
          </div>
          <div>
            <label className="label">Password {!isLogin && <span className="text-ink-700/60">(min 8 characters)</span>}</label>
            <input className="input" type="password" required minLength={isLogin ? 1 : 8} value={form.password} onChange={set('password')} />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button disabled={busy} className="btn-primary w-full">
            {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}
          </button>
          <p className="text-center text-sm text-ink-700">
            {isLogin ? 'New here? ' : 'Already have an account? '}
            <Link to={isLogin ? '/register' : '/login'} className="font-medium text-brand-600 hover:underline">
              {isLogin ? 'Create an account' : 'Log in'}
            </Link>
          </p>
        </form>

        <button onClick={demo} disabled={busy} className="btn-dark mt-4 w-full">
          <Rocket size={16} /> {busy ? 'Loading…' : 'Load Demo Workspace'}
        </button>
        <p className="mt-2 text-center text-xs text-ink-700/70">
          One click: a ready-made launch project with demo Admin, Lead and Member roles.
        </p>
      </div>
    </div>
  );
}
