import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';

const WorkspacesContext = createContext(null);

/** Shared workspace list for the sidebar, plus which workspace the current page belongs to. */
export function WorkspacesProvider({ children }) {
  const [workspaces, setWorkspaces] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const refresh = useCallback(
    () =>
      api
        .get('/workspaces')
        .then((r) => setWorkspaces(r.data.workspaces))
        .catch(() => setWorkspaces((w) => w || [])),
    []
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <WorkspacesContext.Provider value={{ workspaces, activeId, setActiveId, refresh }}>
      {children}
    </WorkspacesContext.Provider>
  );
}

export const useWorkspaces = () => useContext(WorkspacesContext);

/** Call from a page so the sidebar highlights/expands that workspace (pass null for none). */
export function useActiveWorkspace(id) {
  const { setActiveId } = useWorkspaces();
  useEffect(() => {
    setActiveId(id ?? null);
  }, [id, setActiveId]);
}
