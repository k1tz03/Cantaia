"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "cantaia_active_project_id";

export interface NavCounts {
  task_count: number;
  plan_count: number;
  submission_count: number;
  meeting_count: number;
  visit_count: number;
  email_count: number;
  has_budget_estimate: boolean;
}

export interface ActiveProject {
  id: string;
  name: string;
  color: string | null;
}

export interface ActiveProjectContextType {
  activeProject: ActiveProject | null;
  navCounts: NavCounts | null;
  isLoading: boolean;
  setActiveProject: (projectId: string | null) => void;
  refreshCounts: () => Promise<void>;
}

const ActiveProjectContext = createContext<ActiveProjectContextType>({
  activeProject: null,
  navCounts: null,
  isLoading: false,
  setActiveProject: () => {},
  refreshCounts: async () => {},
});

export function ActiveProjectProvider({
  userId,
  children,
}: {
  userId: string | undefined;
  children: ReactNode;
}) {
  const [activeProject, setActiveProjectState] = useState<ActiveProject | null>(null);
  const [navCounts, setNavCounts] = useState<NavCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProjectData = useCallback(
    async (projectId: string) => {
      if (!userId) return;
      setIsLoading(true);
      try {
        const [projectRes, countsRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/nav-counts`),
        ]);

        if (projectRes.status === 403 || countsRes.status === 403) {
          localStorage.removeItem(STORAGE_KEY);
          setActiveProjectState(null);
          setNavCounts(null);
          return;
        }

        if (!projectRes.ok || !countsRes.ok) {
          localStorage.removeItem(STORAGE_KEY);
          setActiveProjectState(null);
          setNavCounts(null);
          return;
        }

        const projectData = await projectRes.json();
        const countsData = await countsRes.json();

        const project = projectData.project || projectData;
        setActiveProjectState({
          id: project.id,
          name: project.name,
          color: project.color || null,
        });
        setNavCounts(countsData);
        localStorage.setItem(STORAGE_KEY, projectId);
      } catch (err) {
        console.error("[ActiveProjectContext] fetch failed:", err);
        localStorage.removeItem(STORAGE_KEY);
        setActiveProjectState(null);
        setNavCounts(null);
      } finally {
        setIsLoading(false);
      }
    },
    [userId]
  );

  const refreshCounts = useCallback(async () => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/nav-counts`);
      if (res.ok) {
        const data = await res.json();
        setNavCounts(data);
      }
    } catch (err) {
      console.error("[ActiveProjectContext] refreshCounts failed:", err);
    }
  }, [activeProject]);

  const setActiveProject = useCallback(
    (projectId: string | null) => {
      if (!projectId) {
        localStorage.removeItem(STORAGE_KEY);
        setActiveProjectState(null);
        setNavCounts(null);
        return;
      }
      if (activeProject?.id === projectId) return;
      fetchProjectData(projectId);
    },
    [activeProject?.id, fetchProjectData]
  );

  useEffect(() => {
    if (!userId) return;
    const storedId = localStorage.getItem(STORAGE_KEY);
    if (storedId) {
      fetchProjectData(storedId);
    }
  }, [userId, fetchProjectData]);

  useEffect(() => {
    const handleFocus = () => {
      if (activeProject) {
        refreshCounts();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [activeProject, refreshCounts]);

  const value = useMemo<ActiveProjectContextType>(
    () => ({
      activeProject,
      navCounts,
      isLoading,
      setActiveProject,
      refreshCounts,
    }),
    [activeProject, navCounts, isLoading, setActiveProject, refreshCounts]
  );

  return (
    <ActiveProjectContext.Provider value={value}>
      {children}
    </ActiveProjectContext.Provider>
  );
}

export function useActiveProject() {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) {
    throw new Error("useActiveProject must be used within ActiveProjectProvider");
  }
  return ctx;
}

export function useActiveProjectSafe() {
  return useContext(ActiveProjectContext);
}
