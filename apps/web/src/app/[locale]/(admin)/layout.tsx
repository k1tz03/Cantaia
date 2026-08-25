"use client";

import { useState, useEffect } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Building2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);

  // Client-side guard: the sidebar only hides the link — verify access
  // server-side (role admin/director or superadmin) and bounce everyone else.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/check-access")
      .then((res) => {
        if (!cancelled && (res.status === 401 || res.status === 403)) {
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        // Network error: don't lock the user out — API routes stay guarded
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen bg-[#0F0F11]">
      {/* Minimal Admin Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-[#27272A] bg-[#111113] transition-all duration-200 ${
          collapsed ? "w-[60px]" : "w-[200px]"
        }`}
      >
        {/* Header */}
        <div className="flex h-14 items-center gap-2 border-b border-[#27272A] px-3">
          <Building2 className="h-5 w-5 shrink-0 text-[#F97316]" />
          {!collapsed && (
            <span className="text-sm font-bold text-[#FAFAFA]">
              {t("title")}
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto rounded p-1 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Back to app */}
        <div className="border-t border-[#27272A] p-2">
          <Link
            href="/mail"
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{t("backToApp")}</span>}
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 overflow-auto transition-all duration-200 ${
          collapsed ? "ml-[60px]" : "ml-[200px]"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
