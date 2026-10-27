import { createContext, useContext, useEffect, useState } from 'react';
import api, { TOKEN_KEY } from '../api/client.js';

const AuthContext = createContext(null);
const DEMO_KEY = 'operateos_demo_sessions';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem(TOKEN_KEY));
  const [demoSessions, setDemoSessions] = useState(() => JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'));

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api
      .get('/auth/me')
      .then((r) => setUser(r.data.user))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const startSession = (token, u) => {
    localStorage.setItem(TOKEN_KEY, token);
    setUser(u);
  };

  const clearDemo = () => {
    localStorage.removeItem(DEMO_KEY);
    setDemoSessions(null);
  };

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    clearDemo();
    startSession(data.token, data.user);
  };

  const register = async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    clearDemo();
    startSession(data.token, data.user);
  };

  // Creates a fresh demo workspace and logs in as the demo ADMIN.
  const loadDemo = async () => {
    const { data } = await api.post('/workspaces/demo');
    localStorage.setItem(DEMO_KEY, JSON.stringify(data.sessions));
    setDemoSessions(data.sessions);
    const admin = data.sessions.find((s) => s.role === 'ADMIN');
    startSession(admin.token, admin.user);
    return data;
  };

  const switchDemoRole = (role) => {
    const s = demoSessions?.find((x) => x.role === role);
    if (s) startSession(s.token, s.user);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    clearDemo();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, demoSessions, login, register, loadDemo, switchDemoRole, logout, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
