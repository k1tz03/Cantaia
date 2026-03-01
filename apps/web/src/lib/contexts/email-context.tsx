"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import type { EmailRecord } from "@cantaia/database";

interface EmailContextValue {
  emails: EmailRecord[];
  loading: boolean;
  syncing: boolean;
  hasRealData: boolean;
  readIds: Set<string>;
  unreadCount: number;
  pendingClassificationCount: number;
  markAsRead: (emailId: string) => void;
  syncEmails: () => Promise<any>;
  refetch: () => Promise<void>;
  reclassifyAll: () => Promise<any>;
}

const EmailContext = createContext<EmailContextValue | null>(null);

export function EmailProvider({ userId, children }: { userId: string | undefined; children: ReactNode }) {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Check if an active email connection exists (separate from email count)
  const checkConnection = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/emails/get-connection");
      if (res.ok) {
        const json = await res.json();
        if (json.connection) {
          setHasRealData(true);
        }
      }
    } catch {
      // Ignore — will fallback to email-count check
    }
  }, [userId]);

  const fetchEmails = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/emails/inbox");
      if (!res.ok) {
        console.error("[EmailContext] fetchEmails failed:", res.status);
        return;
      }
      const json = await res.json();
      const data = json.emails || [];

      setEmails(data as EmailRecord[]);
      if (data.length > 0) {
        setHasRealData(true);
        // Mark already-read emails from DB
        const alreadyRead = new Set<string>();
        for (const e of data) {
          if ((e as any).is_read) alreadyRead.add((e as any).id);
        }
        setReadIds((prev) => {
          const merged = new Set(prev);
          alreadyRead.forEach((id) => merged.add(id));
          return merged;
        });
      }
    } catch (err) {
      console.error("[EmailContext] fetchEmails error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    checkConnection();
    fetchEmails();
  }, [checkConnection, fetchEmails]);

  const syncEmails = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/outlook/sync", { method: "POST" });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error("[EmailContext] sync failed:", response.status, text);
        return { error: `Sync failed (HTTP ${response.status})`, success: false };
      }
      const result = await response.json();
      if (result.success) {
        await fetchEmails();
      }
      return result;
    } catch (err) {
      console.error("[EmailContext] sync error:", err);
      return { error: err instanceof Error ? err.message : "Sync failed", success: false };
    } finally {
      setSyncing(false);
    }
  }, [fetchEmails]);

  const reclassifyAll = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/ai/reclassify-all", { method: "POST" });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error("[EmailContext] reclassify failed:", response.status, text);
        return { error: `Reclassification failed (HTTP ${response.status})`, success: false };
      }
      const result = await response.json();
      if (result.success) {
        await fetchEmails();
      }
      return result;
    } catch (err) {
      console.error("[EmailContext] reclassify error:", err);
      return { error: err instanceof Error ? err.message : "Reclassification failed", success: false };
    } finally {
      setSyncing(false);
    }
  }, [fetchEmails]);

  const markAsRead = useCallback((emailId: string) => {
    setReadIds((prev) => new Set(prev).add(emailId));
  }, []);

  const unreadCount = emails.filter((e) => !readIds.has(e.id)).length;
  const pendingClassificationCount = emails.filter(
    (e) => {
      const status = (e as any).classification_status;
      return status === "suggested" || status === "new_project_suggested";
    }
  ).length;

  const value = useMemo<EmailContextValue>(
    () => ({
      emails,
      loading,
      syncing,
      hasRealData,
      readIds,
      unreadCount,
      pendingClassificationCount,
      markAsRead,
      syncEmails,
      refetch: fetchEmails,
      reclassifyAll,
    }),
    [emails, loading, syncing, hasRealData, readIds, unreadCount, pendingClassificationCount, markAsRead, syncEmails, fetchEmails, reclassifyAll]
  );

  return (
    <EmailContext.Provider value={value}>
      {children}
    </EmailContext.Provider>
  );
}

export function useEmailContext() {
  const ctx = useContext(EmailContext);
  if (!ctx) {
    throw new Error("useEmailContext must be used within EmailProvider");
  }
  return ctx;
}

/** Safe version that returns null when outside EmailProvider */
export function useEmailContextSafe() {
  return useContext(EmailContext);
}
