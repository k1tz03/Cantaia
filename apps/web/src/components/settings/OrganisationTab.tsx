"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Users,
  ArrowRight,
  Loader2,
  Building2,
} from "lucide-react";

export function OrganisationTab() {
  const t = useTranslations("settings");
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/members")
      .then((r) => r.json())
      .then((d) => {
        setMemberCount(d.members?.length || 1);
      })
      .catch(() => setMemberCount(1))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[#71717A]" />
      </div>
    );
  }

  // Solo user
  if (memberCount !== null && memberCount <= 1) {
    return (
      <div className="rounded-[10px] border border-[#27272A] bg-[#18181B] p-6">
        <div className="flex flex-col items-center text-center py-8">
          <Building2 className="h-10 w-10 text-[#52525B]" />
          <h3 className="mt-3 text-[13px] font-medium text-[#71717A]">
            {t("orgSoloTitle")}
          </h3>
          <p className="mt-1 max-w-sm text-[11px] text-[#52525B]">
            {t("orgSoloDesc")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <Users className="h-4 w-4 text-[#71717A]" />
          {t("teamMembers")}
        </div>
        <p className="text-[13px] text-[#71717A] mb-3">
          {memberCount} {t("membersCount")}
        </p>
        <Link
          href="/admin/members"
          className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#3F3F46] bg-[#27272A] px-[14px] py-[6px] text-[11px] font-medium text-[#D4D4D8] hover:bg-[#3F3F46]"
        >
          {t("manageMembers")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
