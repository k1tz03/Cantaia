"use client";

import { useEffect, useState } from "react";

export interface SidebarBadges {
  /** Unprocessed mail count. */
  mail: number;
  /** Agent-generated drafts waiting for review (shown on the Mail badge). */
  drafts: number;
  /** Unread support messages. */
  support: number;
  /** Open supplier alerts. */
  supplierAlerts: number;
}

const EMPTY: SidebarBadges = { mail: 0, drafts: 0, support: 0, supplierAlerts: 0 };
const POLL_MS = 60_000;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Reads the aggregated badge counts from `GET /api/badges` (one request
 * per minute instead of four).
 *
 * The endpoint is owned by another workstream, so this is written to
 * degrade rather than break: a 404 (or any failure) flips the hook into
 * legacy mode and it polls the four original endpoints instead. Key
 * names are read liberally so a slightly different response shape still
 * lights up the badges.
 */
export function useSidebarBadges(enabled: boolean): SidebarBadges {
  const [badges, setBadges] = useState<SidebarBadges>(EMPTY);
  // null = not yet determined, true = /api/badges works, false = use legacy polls
  const [aggregated, setAggregated] = useState<boolean | null>(null);

  // --- Preferred path: single aggregated endpoint --------------------
  useEffect(() => {
    if (!enabled || aggregated === false) return;

    let cancelled = false;

    async function fetchAggregated() {
      try {
        const res = await fetch("/api/badges");
        if (!res.ok) {
          // 404 => endpoint not deployed yet; anything else => treat the
          // same way so the sidebar always ends up with real numbers.
          if (!cancelled) setAggregated(false);
          return;
        }
        const d = await res.json();
        if (cancelled) return;
        const src = d?.badges ?? d ?? {};
        setAggregated(true);
        setBadges({
          mail: num(src.mail ?? src.mailUnprocessed ?? src.totalUnprocessed),
          drafts: num(src.drafts ?? src.draftCount ?? src.agentDrafts),
          support: num(src.support ?? src.supportUnread ?? src.supportCount),
          supplierAlerts: num(
            src.supplierAlerts ?? src.supplierAlertCount ?? src.suppliers
          ),
        });
      } catch {
        if (!cancelled) setAggregated(false);
      }
    }

    fetchAggregated();
    const interval = setInterval(fetchAggregated, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, aggregated]);

  // --- Fallback: the four original endpoints ------------------------
  useEffect(() => {
    if (!enabled || aggregated !== false) return;

    let cancelled = false;

    async function one(url: string, pick: (d: any) => number) {
      try {
        const res = await fetch(url);
        if (!res.ok) return 0;
        return num(pick(await res.json()));
      } catch {
        return 0;
      }
    }

    async function fetchAll() {
      const [mail, drafts, support, supplierAlerts] = await Promise.all([
        one("/api/mail/decisions?counts_only=true", (d) => d.totalUnprocessed),
        one("/api/agents/drafts/counts", (d) => d.count),
        one("/api/support/tickets/unread-count", (d) => d.count),
        one("/api/agents/supplier-alerts/counts", (d) => d.total),
      ]);
      if (!cancelled) setBadges({ mail, drafts, support, supplierAlerts });
    }

    fetchAll();
    const interval = setInterval(fetchAll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, aggregated]);

  return badges;
}
