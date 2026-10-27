import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useActiveWorkspace, useWorkspaces } from '../context/WorkspacesContext.jsx';

function Notice({ state }) {
  if (!state) return null;
  return (
    <p className={`rounded-lg px-3 py-2 text-sm ${state.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
      {state.text}
    </p>
  );
}

export default function AccountPage() {
  useActiveWorkspace(null);
  const { user, updateUser } = useAuth();
  const { workspaces } = useWorkspaces();
  const isDemo = user.email.endsWith('@demo.operateos.app');

  const [name, setName] = useState(user.name);
  const [profileMsg, setProfileMsg] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState(null);

  async function saveProfile(e) {
    e.preventDefault();
    setProfileMsg(null);
    try {
      const { data } = await api.patch('/auth/me', { name });
      updateUser(data.user);
      setProfileMsg({ ok: true, text: 'Profile updated.' });
    } catch (err) {
      setProfileMsg({ ok: false, text: errorMessage(err) });
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMsg(null);
    if (pw.newPassword !== pw.confirm) return setPwMsg({ ok: false, text: 'New passwords do not match.' });
    try {
      await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      setPwMsg({ ok: true, text: 'Password changed.' });
    } catch (err) {
      setPwMsg({ ok: false, text: errorMessage(err) });
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Account settings</h1>

      <form onSubmit={saveProfile} className="card space-y-4 p-5">
        <h2 className="font-semibold">Profile</h2>
        <div>
          <label className="label">Name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input bg-cream-50" value={user.email} disabled />
        </div>
        <Notice state={profileMsg} />
        <button className="btn-primary" disabled={!name.trim() || name.trim() === user.name}>Save changes</button>
      </form>

      <form onSubmit={changePassword} className="card space-y-4 p-5">
        <h2 className="font-semibold">Change password</h2>
        {isDemo ? (
          <p className="text-sm text-ink-700">Demo accounts are shared, so their password can't be changed.</p>
        ) : (
          <>
            <div>
              <label className="label">Current password</label>
              <input className="input" type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">New password (min 8 characters)</label>
                <input className="input" type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
              </div>
              <div>
                <label className="label">Confirm new password</label>
                <input className="input" type="password" required minLength={8} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              </div>
            </div>
            <Notice state={pwMsg} />
            <button className="btn-primary">Update password</button>
          </>
        )}
      </form>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Your workspaces & roles</h2>
        {!workspaces?.length ? (
          <p className="text-sm text-ink-700">You are not in any workspace yet.</p>
        ) : (
          <ul className="divide-y divide-cream-200">
            {workspaces.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                <Link to={`/workspace/${w.id}`} className="font-medium hover:text-brand-600">{w.name}</Link>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{w.myRole}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
