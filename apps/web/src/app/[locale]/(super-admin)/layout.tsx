"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  BarChart3,
  Brain,
  Settings,
  ArrowLeft,
  Wrench,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  Bot,
  Activity,
  GitBranch,
} from "lucide-react";
const superAdminNavItems = [
  { href: "/super-admin", icon: LayoutDashboard, labelKey: "dashboard" },
  { href: "/super-admin/organizations", icon: Building2, labelKey: "organizations" },
  { href: "/super-admin/users", icon: Users, labelKey: "allUsers" },
  { href: "/super-admin/billing", icon: CreditCard, labelKey: "billing" },
  { href: "/super-admin/metrics", icon: BarChart3, labelKey: "globalMetrics" },
  { href: "/super-admin/user-analytics", icon: Activity, labelKey: "userAnalytics" },
  { href: "/super-admin/data-intelligence", icon: Brain, labelKey: "dataIntelligence" },
  { href: "/super-admin/data-pipeline", icon: GitBranch, labelKey: "dataPipeline" },
  { href: "/super-admin/ai-costs", icon: DollarSign, labelKey: "aiCosts" },
  { href: "/super-admin/operations", icon: Wrench, labelKey: "operations" },
  { href: "/super-admin/ai-roundtable", icon: Bot, labelKey: "aiRoundtable" },
  { href: "/super-admin/support", icon: LifeBuoy, labelKey: "support" },
  { href: "/super-admin/config", icon: Settings, labelKey: "platformConfig" },
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("superAdmin");
  const [collapsed, setCollapsed] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    async function checkAccess() {
      try {
        const res = await fetch("/api/super-admin?action=check-access");
        if (!res.ok) {
          router.replace("/dashboard");
          return;
        }
        const data = await res.json();
        if (!data.authorized) {
          router.replace("/dashboard");
          return;
        }
        setUserName(data.userName || "");
        setAuthorized(true);
      } catch {
        router.replace("/dashboard");
      }
    }
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Strip locale prefix for matching
  const pathWithoutLocale = pathname.replace(/^\/(fr|en|de)/, "");

  function isActive(href: string) {
    if (href === "/super-admin") return pathWithoutLocale === "/super-admin";
    return pathWithoutLocale.startsWith(href);
  }

  if (authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090B]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="flex min-h-screen bg-[#0F0F11]">
      {/* Super Admin Sidebar — dark theme */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-[#27272A] bg-[#111113] transition-all duration-200 ${
          collapsed ? "w-[60px]" : "w-[240px]"
        }`}
      >
        {/* Header */}
        <div className="flex h-14 items-center gap-2.5 border-b border-[#27272A] px-3">
          <Wrench className="h-5 w-5 shrink-0 text-amber-400" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white">Cantaia</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-amber-400">
                Super Admin
              </span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto rounded p-1 text-[#71717A] hover:bg-[#27272A] hover:text-[#FAFAFA]"
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
          {superAdminNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-amber-500/10 font-medium text-amber-400"
                    : "text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
                }`}
                title={collapsed ? t(item.labelKey) : undefined}
              >
                <item.icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? "text-amber-400" : "text-[#71717A]"
                  }`}
                />
                {!collapsed && <span>{t(item.labelKey)}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User + Back to app */}
        <div className="border-t border-[#27272A] p-2">
          {!collapsed && userName && (
            <div className="mb-2 px-2.5 py-1.5 text-xs text-[#71717A]">
              {t("connectedAs")} <span className="font-medium text-[#FAFAFA]">{userName}</span>
            </div>
          )}
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[#71717A] hover:bg-[#27272A] hover:text-[#FAFAFA]"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{t("backToApp")}</span>}
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 overflow-auto transition-all duration-200 ${
          collapsed ? "ml-[60px]" : "ml-[240px]"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
