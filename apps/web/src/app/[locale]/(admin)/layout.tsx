"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Clock,
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const adminNavItems = [
  { href: "/admin", icon: LayoutDashboard, labelKey: "overview" },
  { href: "/admin/members", icon: Users, labelKey: "members" },
  { href: "/admin/finances", icon: CreditCard, labelKey: "subscription" },
  { href: "/admin/time-savings", icon: Clock, labelKey: "timeSavings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations("admin");
  const [collapsed, setCollapsed] = useState(false);

  // Strip locale prefix for matching
  const pathWithoutLocale = pathname.replace(/^\/(fr|en|de)/, "");

  function isActive(href: string) {
    if (href === "/admin") return pathWithoutLocale === "/admin";
    return pathWithoutLocale.startsWith(href);
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Admin Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-200 ${
          collapsed ? "w-[60px]" : "w-[220px]"
        }`}
      >
        {/* Header */}
        <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-3">
          <Building2 className="h-5 w-5 shrink-0 text-blue-600" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-gray-800">
                {t("title")}
              </span>
              <span className="text-[10px] text-gray-400">Administration</span>
            </div>
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

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {adminNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-800"
                }`}
                title={collapsed ? t(item.labelKey) : undefined}
              >
                <item.icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? "text-blue-600" : "text-gray-400"
                  }`}
                />
                {!collapsed && <span>{t(item.labelKey)}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Back to app */}
        <div className="border-t border-gray-100 p-2">
          <Link
            href="/dashboard"
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
          collapsed ? "ml-[60px]" : "ml-[220px]"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
