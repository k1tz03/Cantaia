import type { Metadata } from "next";
import { AgentsDashboard } from "@/components/agents/AgentsDashboard";

export const metadata: Metadata = {
  title: "Agents IA — Cantaia",
  robots: { index: false, follow: false },
};

/**
 * /agents — Agent control room.
 *
 * Until now the ten agents were invisible: they ran inside other modules or
 * at night, and `agent_sessions` was written but never read by any UI. This
 * page surfaces the last run of each agent (status, duration, result), lets
 * the on-demand ones be relaunched, and exposes the org-level switch for the
 * nightly ones.
 *
 * SIDEBAR: the link to this page is owned by another agent — add
 *   { href: "/agents", label: "Agents IA", icon: Bot }
 * to the daily group of apps/web/src/components/app/Sidebar.tsx.
 */
export default function AgentsPage() {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#0F0F11]">
      <AgentsDashboard />
    </div>
  );
}
