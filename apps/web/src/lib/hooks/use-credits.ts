"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Credits client store.
 *
 * A single module-level store backs every `useCredits()` consumer so the
 * header badge, the low-balance banner and the settings tab share ONE fetch
 * and ONE 120 s poll instead of three.
 *
 * Refresh triggers:
 *   1. first mount            → immediate fetch
 *   2. polling                → every 120 s while at least one consumer is mounted
 *   3. `cantaia:credits-changed` window event → dispatch it after any AI action
 *      (see `notifyCreditsChanged()`)
 *   4. manual `refresh()` returned by the hook
 */

export const CREDITS_CHANGED_EVENT = "cantaia:credits-changed";

const POLL_INTERVAL_MS = 120_000;

export interface CreditTransaction {
  id: string;
  amount: number;
  balance_after: number;
  kind: string;
  action_type: string | null;
  reference: string | null;
  created_at: string;
}

export interface CreditBalance {
  subscription_credits: number;
  purchased_credits: number;
  total: number;
  plan: string | null;
  monthly_allocation: number;
  recent_transactions: CreditTransaction[];
}

interface CreditsState {
  balance: CreditBalance | null;
  loading: boolean;
  /**
   * `true` when GET /api/credits cannot be used (route missing, org not
   * migrated to the credits model yet). Consumers fall back to the legacy
   * quota UI instead of showing a broken balance.
   */
  unavailable: boolean;
  /**
   * Server-reported `degraded` flag: the credit meter itself is broken
   * (migration missing / RPC unreachable) and AI actions are running WITHOUT
   * being debited. Distinct from `unavailable`, which merely means this client
   * could not use the route.
   */
  degraded: boolean;
}

// ── Module-level shared store ───────────────────────────────

let state: CreditsState = {
  balance: null,
  loading: true,
  unavailable: false,
  degraded: false,
};
const listeners = new Set<(s: CreditsState) => void>();
let inFlight: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;

function setState(patch: Partial<CreditsState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
}

/** Fetch the balance. De-duplicated: concurrent callers share one request. */
export function fetchCredits(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch("/api/credits", { cache: "no-store" });
      if (!res.ok) {
        // The 404 `credits_unavailable` body still carries `degraded`, which
        // tells apart "meter broken" from "org not on credits yet".
        let degraded = false;
        try {
          const body = await res.json();
          degraded = body?.degraded === true;
        } catch {
          /* non-JSON error body */
        }
        setState({ loading: false, unavailable: true, degraded });
        return;
      }
      const data = await res.json();
      if (!data || typeof data.total !== "number") {
        setState({ loading: false, unavailable: true, degraded: false });
        return;
      }
      setState({
        balance: {
          subscription_credits: Number(data.subscription_credits) || 0,
          purchased_credits: Number(data.purchased_credits) || 0,
          total: Number(data.total) || 0,
          plan: typeof data.plan === "string" ? data.plan : null,
          monthly_allocation: Number(data.monthly_allocation) || 0,
          recent_transactions: Array.isArray(data.recent_transactions)
            ? (data.recent_transactions as CreditTransaction[])
            : [],
        },
        loading: false,
        unavailable: false,
        degraded: data.degraded === true,
      });
    } catch {
      // Network error / offline — degrade silently, never break the app shell.
      setState({ loading: false, unavailable: true, degraded: false });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Dispatch after any action that consumes credits so every mounted badge /
 * banner refreshes without waiting for the next poll.
 */
export function notifyCreditsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CREDITS_CHANGED_EVENT));
}

// ── Hook ────────────────────────────────────────────────────

export interface UseCreditsReturn {
  balance: CreditBalance | null;
  loading: boolean;
  unavailable: boolean;
  /** Credit meter broken server-side — actions currently run un-debited. */
  degraded: boolean;
  refresh: () => Promise<void>;
}

export function useCredits(): UseCreditsReturn {
  const [local, setLocal] = useState<CreditsState>(state);

  useEffect(() => {
    const listener = (s: CreditsState) => setLocal(s);
    listeners.add(listener);
    subscriberCount += 1;

    // Sync with whatever the store already holds (a sibling may have loaded it).
    setLocal(state);
    if (state.balance === null) void fetchCredits();

    if (!pollTimer) {
      pollTimer = setInterval(() => {
        void fetchCredits();
      }, POLL_INTERVAL_MS);
    }

    const onChanged = () => {
      void fetchCredits();
    };
    window.addEventListener(CREDITS_CHANGED_EVENT, onChanged);

    return () => {
      listeners.delete(listener);
      subscriberCount -= 1;
      window.removeEventListener(CREDITS_CHANGED_EVENT, onChanged);
      if (subscriberCount <= 0 && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  }, []);

  const refresh = useCallback(async () => {
    await fetchCredits();
  }, []);

  return {
    balance: local.balance,
    loading: local.loading,
    unavailable: local.unavailable,
    degraded: local.degraded,
    refresh,
  };
}
