"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EmailRecord, Project, Task } from "@cantaia/database";

const supabase = createClient();

export function useEmails(userId: string | undefined) {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);

  const fetchEmails = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("email_records")
        .select("*")
        .eq("user_id", userId)
        .order("received_at", { ascending: false });

      if (!error && data && data.length > 0) {
        setEmails(data as unknown as EmailRecord[]);
        setHasRealData(true);
      }
    } catch {
      // No data available
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const syncEmails = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/outlook/sync", { method: "POST" });
      const result = await response.json();
      if (result.success) {
        await fetchEmails();
      }
      return result;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Sync failed" };
    } finally {
      setSyncing(false);
    }
  }, [fetchEmails]);

  return { emails, loading, syncing, hasRealData, syncEmails, refetch: fetchEmails };
}

export function useProjects(organizationId: string | undefined) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Fetch via API route (admin client) to bypass RLS
    fetch("/api/projects/list")
      .then((res) => res.json())
      .then((data) => {
        if (data.projects && data.projects.length > 0) {
          setProjects(data.projects as Project[]);
          setHasRealData(true);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [organizationId]);

  return { projects, loading, hasRealData };
}

export function useTasks(userId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);

    supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          setTasks(data as unknown as Task[]);
          setHasRealData(true);
        }
        setLoading(false);
      }, () => {
        setLoading(false);
      });
  }, [userId]);

  return { tasks, loading, hasRealData };
}

/**
 * Fetch a single project by ID via the admin API route (bypasses RLS).
 */
export function useProject(projectId: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        setProject(data.project || null);
        setLoading(false);
      })
      .catch(() => {
        setProject(null);
        setLoading(false);
      });
  }, [projectId]);

  return { project, loading };
}

export function useUserProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<{
    organization_id: string | null;
    outlook_sync_enabled: boolean;
    last_sync_at: string | null;
    microsoft_access_token: string | null;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoaded(true);
      return;
    }

    // Fetch via API route (admin client) to bypass RLS
    fetch("/api/user/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) {
          setProfile(data.profile);
        }
      })
      .catch(() => {
        // Profile not available
      })
      .finally(() => {
        setLoaded(true);
      });
  }, [userId]);

  return { profile, loaded };
}
