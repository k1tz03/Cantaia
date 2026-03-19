"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
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
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Minimal Admin Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-200 ${
          collapsed ? "w-[60px]" : "w-[200px]"
        }`}
      >
        {/* Header */}
        <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-3">
          <Building2 className="h-5 w-5 shrink-0 text-blue-600" />
          {!collapsed && (
            <span className="text-sm font-bold text-gray-800">
              {t("title")}
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
        <div className="border-t border-gray-100 p-2">
          <Link
            href="/mail"
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
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
