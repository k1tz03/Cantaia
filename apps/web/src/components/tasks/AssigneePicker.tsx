"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// ============================================================
// AssigneePicker — real assignment, at last
// ============================================================
//
// `tasks.assigned_to` (UUID FK to users) shipped in migration 001 and was never
// written by a human path: the UI only ever offered a free-text
// `assigned_to_name`. Consequence: no "Mes taches" view, no assignment
// notification, and per-member team health that structurally read 0.
//
// This picker fills the FK. The free-text field stays next to it for external
// stakeholders (architect, client, supplier) who have no Cantaia account.

export interface OrgMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export function memberLabel(member: OrgMember): string {
  const name = `${member.first_name || ""} ${member.last_name || ""}`.trim();
  return name || member.email || member.id.slice(0, 8);
}

/** Loads the org member directory once per mount (GET /api/admin/clients). */
export function useOrgMembers(enabled = true) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);

    fetch("/api/admin/clients")
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => {
        if (!cancelled) setMembers(Array.isArray(d.members) ? d.members : []);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { members, loading };
}

interface AssigneePickerProps {
  members: OrgMember[];
  value: string | null;
  /** Receives the member id (or null) plus the resolved display name. */
  onChange: (userId: string | null, displayName: string | null) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function AssigneePicker({
  members,
  value,
  onChange,
  disabled,
  className,
  id,
}: AssigneePickerProps) {
  const t = useTranslations("tasks");

  const selectClass =
    className ||
    "w-full rounded-md border border-[#27272A] bg-[#27272A] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none disabled:opacity-50";

  return (
    <select
      id={id}
      value={value || ""}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value;
        if (!next) {
          onChange(null, null);
          return;
        }
        const member = members.find((m) => m.id === next);
        onChange(next, member ? memberLabel(member) : null);
      }}
      className={selectClass}
    >
      <option value="">{t("assigneeUnassigned")}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {memberLabel(m)}
        </option>
      ))}
    </select>
  );
}
