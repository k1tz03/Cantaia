"use client";

/**
 * Offline plumbing for the field portal.
 *
 * A chef d'équipe fills the daily report in a basement, in a lift shaft, behind
 * a concrete wall — the network is NOT a given. Losing a day of hours because a
 * POST failed is the single defect that would disqualify the product on site,
 * so everything typed is persisted locally on each keystroke and replayed when
 * the connection comes back.
 *
 * Two storages, on purpose:
 *   - localStorage  → the form draft (small, synchronous, survives a tab kill)
 *   - IndexedDB     → pending photo blobs (megabytes, cannot live in localStorage)
 *
 * Every helper is total: storage unavailable (private mode, quota exceeded,
 * IndexedDB disabled) degrades to "no offline copy", never to a thrown error
 * that would break the form.
 */

import { useEffect, useState } from "react";

// ── Draft persistence (localStorage) ──────────────────────────────────

const DRAFT_PREFIX = "cantaia_portal_draft";

/** One draft per project + date + author: two foremen on the same site never collide. */
export function buildDraftKey(projectId: string, reportDate: string, userName: string): string {
  const author = (userName || "anon").trim().toLowerCase().replace(/\s+/g, "-");
  return `${DRAFT_PREFIX}:${projectId}:${reportDate}:${author}`;
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded or storage disabled: the in-memory state is still correct,
    // the user simply loses the "survives a reload" guarantee.
    return false;
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Drop portal drafts older than `maxAgeMs` (default 21 days). Without this the
 * per-day draft keys accumulate one row per day per site forever, eventually
 * bumping the ~5 MB localStorage quota and silently breaking new saves. Only
 * touches this feature's own keys; a malformed/legacy value is removed too.
 */
export function purgeStaleDrafts(maxAgeMs = 21 * 24 * 60 * 60 * 1000): void {
  try {
    const cutoff = Date.now() - maxAgeMs;
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(`${DRAFT_PREFIX}:`)) continue;
      try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? (JSON.parse(raw) as { updatedAt?: number }) : null;
        const updatedAt = typeof parsed?.updatedAt === "number" ? parsed.updatedAt : 0;
        if (updatedAt < cutoff) toRemove.push(key);
      } catch {
        toRemove.push(key); // unparseable → remove
      }
    }
    for (const key of toRemove) window.localStorage.removeItem(key);
  } catch {
    /* storage disabled — nothing to purge */
  }
}

// ── Pending photos (IndexedDB) ────────────────────────────────────────

const DB_NAME = "cantaia-portal";
const DB_VERSION = 1;
const PHOTO_STORE = "pending-photos";

export interface PendingPhoto {
  blob: Blob;
  name: string;
  type: string;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          db.createObjectStore(PHOTO_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      // Safari private mode can hang here; do not block the UI forever.
      setTimeout(() => resolve(request.readyState === "done" ? request.result ?? null : null), 3000);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const tx = db.transaction(PHOTO_STORE, mode);
      const request = run(tx.objectStore(PHOTO_STORE));
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      resolve(null);
    }
  });
}

/** Returns false when the blob could not be persisted (caller must warn the user). */
export async function savePendingPhoto(id: string, file: File): Promise<boolean> {
  const payload: PendingPhoto = {
    blob: file,
    name: file.name || "photo.jpg",
    type: file.type || "image/jpeg",
    createdAt: Date.now(),
  };
  const result = await withStore<IDBValidKey>("readwrite", (store) => store.put(payload, id));
  return result !== null;
}

export async function getPendingPhoto(id: string): Promise<File | null> {
  const stored = await withStore<PendingPhoto>("readonly", (store) => store.get(id));
  if (!stored?.blob) return null;
  try {
    return new File([stored.blob], stored.name, { type: stored.type });
  } catch {
    return null;
  }
}

export async function deletePendingPhoto(id: string): Promise<void> {
  await withStore<undefined>("readwrite", (store) => store.delete(id));
}

/** Stable id for a photo queued offline (kept in the draft alongside the note). */
export function newPendingPhotoId(): string {
  return `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Network status ────────────────────────────────────────────────────

/**
 * `navigator.onLine` only proves the device has *a* link (site wifi with no
 * uplink still reports true), so it is a hint, not a truth. The form treats a
 * failed request as the real offline signal and uses this hook to know when it
 * is worth retrying.
 */
export function useOnlineStatus(): boolean {
  // Start optimistic: SSR and the first client render must agree.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
