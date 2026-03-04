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
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Solo user — show simplified message
  if (memberCount !== null && memberCount <= 1) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex flex-col items-center text-center py-8">
          <Building2 className="h-10 w-10 text-gray-300" />
          <h3 className="mt-3 text-sm font-medium text-gray-600">
            {t("orgSoloTitle")}
          </h3>
          <p className="mt-1 max-w-sm text-xs text-gray-400">
            {t("orgSoloDesc")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Members */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Users className="h-4 w-4 text-gray-400" />
          {t("teamMembers")}
        </h3>
        <p className="mb-1 text-sm text-gray-500">
          {memberCount} {t("membersCount")}
        </p>
        <Link
          href="/admin/members"
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 sm:w-auto sm:justify-start"
        >
          {t("manageMembers")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
