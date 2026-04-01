"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type WorkspaceContextType = {
  workspaceId: string | null;
  setWorkspaceId: (id: string) => void;
  isLoading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Kugelsicherer Block: Egal was passiert, er lädt weiter!
    try {
      const savedWorkspace = localStorage.getItem('shedsync_workspace');
      if (savedWorkspace) {
        setWorkspaceIdState(savedWorkspace);
      }
    } catch (error) {
      console.warn("Konnte den Workspace nicht aus dem Speicher lesen:", error);
    } finally {
      // Das hier wird GARANTIERT ausgeführt, der Ladescreen verschwindet also immer!
      setIsLoading(false); 
    }
  }, []);

  const setWorkspaceId = (id: string) => {
    try {
      localStorage.setItem('shedsync_workspace', id);
    } catch (error) {
      console.warn("Konnte den Workspace nicht speichern:", error);
    }
    setWorkspaceIdState(id);
  };

  return (
    <WorkspaceContext.Provider value={{ workspaceId, setWorkspaceId, isLoading }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace muss innerhalb eines WorkspaceProviders verwendet werden');
  }
  return context;
}