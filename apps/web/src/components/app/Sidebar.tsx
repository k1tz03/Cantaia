"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { useBranding } from "@/components/providers/BrandingProvider";
import { useEmailContextSafe } from "@/lib/contexts/email-context";
import { cn } from "@cantaia/ui";
import {
  FolderKanban,
  CheckSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sparkles,
  Shield,
  Map,
  FileSpreadsheet,
  TrendingUp,
  LayoutDashboard,
  Mail,
  FileText,
  Truck,
  MessageSquare,
  MoreHorizontal,
  X,
  BarChart3,
  Newspaper,
  HardHat,
} from "lucide-react";

type NavItemStatus = "active" | "coming_soon" | "locked";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
  status: NavItemStatus;
  badge?: string;
  badgeLabelKey?: string;
  group?: string;
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("cantaia_sidebar_collapsed") === "true";
    }
    return false;
  });
  const [userRole, setUserRole] = useState<string | null>(null);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { user, signOut } = useAuth();
  const { branding } = useBranding();
  const emailCtx = useEmailContextSafe();
  const unreadEmailCount = emailCtx?.unreadCount || 0;

  const [profileSuperAdmin, setProfileSuperAdmin] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.profile?.role) setUserRole(d.profile.role);
        if (d.profile?.is_superadmin) setProfileSuperAdmin(true);
      })
      .catch(() => {});
  }, [user?.id]);

  const isManager = ["project_manager", "director", "admin"].includes(userRole || "");
  const isSuperAdmin = !!user?.user_metadata?.is_superadmin || profileSuperAdmin;

  const navItems: NavItem[] = [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, status: "active", group: "main" },
    { href: "/mail", labelKey: "mail", icon: Mail, status: "active", badge: unreadEmailCount > 0 ? String(unreadEmailCount) : undefined, group: "daily" },
    { href: "/briefing", labelKey: "briefing", icon: Newspaper, status: "active", group: "daily" },
    { href: "/tasks", labelKey: "tasks", icon: CheckSquare, status: "active", group: "daily" },
    { href: "/pv-chantier", labelKey: "pv", icon: FileText, status: "active", group: "daily" },
    { href: "/visits", labelKey: "visits", icon: HardHat, status: "active", group: "daily" },
    { href: "/projects", labelKey: "projects", icon: FolderKanban, status: "active", group: "projects" },
    { href: "/plans", labelKey: "plans", icon: Map, status: "active", group: "projects" },
    { href: "/submissions", labelKey: "submissions", icon: FileSpreadsheet, status: "active", group: "projects" },
    { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "active", group: "data" },
    { href: "/cantaia-prix", labelKey: "cantaiaPrix", icon: TrendingUp, status: "active", group: "data" },
    { href: "/chat", labelKey: "chat", icon: MessageSquare, status: "active", group: "assistant" },
    ...((isManager || isSuperAdmin) ? [
      { href: "/direction", labelKey: "direction", icon: BarChart3, status: "active" as NavItemStatus, group: "management" },
    ] : []),
  ];

  const bottomItems: NavItem[] = [
    { href: "/settings", labelKey: "settings", icon: Settings, status: "active" },
  ];

  const userName = user?.user_metadata?.first_name || t("user");
  const userInitials = `${(user?.user_metadata?.first_name || "U")[0]}${(user?.user_metadata?.last_name || "")[0] || ""}`.toUpperCase();

  useEffect(() => {
    localStorage.setItem("cantaia_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  const isBranded = branding.brandingEnabled;
  const displayName = branding.customName || "Cantaia";

  function isActive(href: string): boolean {
    const pathWithoutLocale = pathname.replace(/^\/(fr|en|de)/, "");
    return pathWithoutLocale === href || pathWithoutLocale.startsWith(href + "/");
  }

  const sidebarStyle = isBranded
    ? { backgroundColor: branding.sidebarColor }
    : undefined;

  function renderNavItem(item: NavItem) {
    const Icon = item.icon;
    const active = isActive(item.href);
    const isDisabled = item.status !== "active";
    const badgeText = item.badgeLabelKey ? t(item.badgeLabelKey) : item.badge;

    if (isDisabled) {
      return (
        <li key={item.href}>
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium cursor-not-allowed select-none",
              collapsed && "justify-center px-0"
            )}
            title={collapsed ? t(item.labelKey) : undefined}
          >
            <Icon className="h-[18px] w-[18px] shrink-0 text-gray-300" />
            {!collapsed && (
              <>
                <span className="flex-1 text-gray-300">{t(item.labelKey)}</span>
                {badgeText && (
                  <span className="text-[10px] font-medium bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">
                    {badgeText}
                  </span>
                )}
              </>
            )}
          </div>
        </li>
      );
    }

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
            active
              ? "bg-blue-50 text-[#2563EB] border-l-[3px] border-l-[#2563EB]"
              : "text-[#6B7280] hover:bg-gray-50 hover:text-[#111827]",
            collapsed && "justify-center px-0 border-l-0",
            active && collapsed && "bg-blue-50"
          )}
          style={active && isBranded ? { color: branding.primaryColor, backgroundColor: `${branding.primaryColor}10`, borderLeftColor: branding.primaryColor } : undefined}
          title={collapsed ? t(item.labelKey) : undefined}
        >
          <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-[#2563EB]" : "text-[#9CA3AF]")} />
          {!collapsed && (
            <>
              <span className="flex-1">{t(item.labelKey)}</span>
              {badgeText && (
                <span className="text-[10px] font-semibold bg-[#2563EB] text-white px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {badgeText}
                </span>
              )}
            </>
          )}
        </Link>
      </li>
    );
  }

  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const mobileItems: NavItem[] = [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, status: "active" },
    { href: "/mail", labelKey: "mail", icon: Mail, status: "active" },
    { href: "/projects", labelKey: "projects", icon: FolderKanban, status: "active" },
    { href: "/tasks", labelKey: "tasks", icon: CheckSquare, status: "active" },
  ];

  const mobileExtraItems: NavItem[] = [
    { href: "/briefing", labelKey: "briefing", icon: Newspaper, status: "active" },
    { href: "/plans", labelKey: "plans", icon: Map, status: "active" },
    { href: "/submissions", labelKey: "submissions", icon: FileSpreadsheet, status: "active" },
    { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "active" },
    { href: "/cantaia-prix", labelKey: "cantaiaPrix", icon: TrendingUp, status: "active" },
    { href: "/pv-chantier", labelKey: "pv", icon: FileText, status: "active" },
    { href: "/visits", labelKey: "visits", icon: HardHat, status: "active" },
    { href: "/chat", labelKey: "chat", icon: MessageSquare, status: "active" },
    ...((isManager || isSuperAdmin) ? [
      { href: "/direction", labelKey: "direction", icon: BarChart3, status: "active" as NavItemStatus },
      { href: "/admin", labelKey: "admin", icon: Shield, status: "active" as NavItemStatus },
    ] : []),
    { href: "/settings", labelKey: "settings", icon: Settings, status: "active" },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col border-r border-[#E5E7EB] transition-all duration-200 h-screen sticky top-0",
          collapsed ? "w-[64px]" : "w-[240px]",
          !isBranded && "bg-white"
        )}
        style={sidebarStyle}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center border-b border-[#E5E7EB] h-14 px-4",
          collapsed ? "justify-center" : "gap-2.5"
        )}>
          {isBranded && branding.logoUrl ? (
            <img src={branding.logoUrl} alt={displayName} className="h-8 max-w-[140px] object-contain" />
          ) : (
            <>
              <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" fill="none">
                <rect x="2" y="8" width="28" height="18" rx="3" stroke="#2563EB" strokeWidth="2" />
                <path d="M8 14h6M8 18h10M8 22h8" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M22 14l4 4-4 4" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {!collapsed && (
                <span className="font-display text-lg font-bold tracking-tight text-[#111827]">
                  Cantaia
                </span>
              )}
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-0.5">
            {navItems.map(renderNavItem)}
          </ul>

          {/* Settings */}
          <div className="mt-3 border-t border-[#E5E7EB] pt-3">
            <ul className="space-y-0.5">
              {bottomItems.map(renderNavItem)}
            </ul>
          </div>

          {/* Admin link — visible to project_manager, director, admin, superadmin */}
          {(isManager || isSuperAdmin) && (
            <div className="mt-1">
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive("/admin")
                    ? "bg-red-50 text-red-700"
                    : "text-[#9CA3AF] hover:bg-red-50/50 hover:text-red-600",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? t("admin") : undefined}
              >
                <Shield className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="flex-1">{t("admin")}</span>}
              </Link>
            </div>
          )}
        </nav>

        {/* Plan indicator */}
        {!collapsed && (
          <div className="mx-3 mb-2 rounded-lg bg-gray-100 border border-gray-200 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Sparkles
                className="h-3.5 w-3.5 text-gray-400"
                style={isBranded ? { color: branding.accentColor } : undefined}
              />
              <span className="text-[11px] font-semibold text-gray-600">
                {t("planTrial")}
              </span>
              <span className="ml-auto text-[11px] text-gray-500">
                {t("trialDaysLeft", { days: 12 })}
              </span>
            </div>
          </div>
        )}

        {/* User & Collapse */}
        <div className="border-t border-[#E5E7EB] p-3">
          {!collapsed && (
            <div className="mb-1.5 flex items-center gap-2 rounded-lg px-2 py-1.5">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold bg-blue-100 text-[#2563EB]"
                style={isBranded ? { backgroundColor: `${branding.primaryColor}20`, color: branding.primaryColor } : undefined}
              >
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[#111827]">{userName}</p>
              </div>
              <button
                onClick={signOut}
                className="rounded-md p-1 text-[#9CA3AF] hover:bg-gray-100 hover:text-[#6B7280] transition-colors"
                title={t("logout")}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#9CA3AF] transition-colors hover:bg-gray-50 hover:text-[#6B7280]"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>{t("collapse")}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#E5E7EB] bg-white/95 backdrop-blur-md lg:hidden safe-area-bottom" role="navigation" aria-label="Mobile navigation">
        <div className="flex items-center justify-evenly px-1 py-1">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors",
                  active ? "text-[#2563EB]" : "text-[#9CA3AF] hover:text-[#6B7280]"
                )}
                style={active && isBranded ? { color: branding.primaryColor } : undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-[56px]">{t(item.labelKey)}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
            className={cn(
              "relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors",
              mobileMoreOpen ? "text-[#2563EB]" : "text-[#9CA3AF] hover:text-[#6B7280]"
            )}
            aria-expanded={mobileMoreOpen}
            aria-label={t("more")}
          >
            {mobileMoreOpen ? <X className="h-5 w-5" /> : <MoreHorizontal className="h-5 w-5" />}
            <span className="truncate max-w-[56px]">{t("more")}</span>
          </button>
        </div>
      </nav>

      {/* Mobile More Sheet */}
      {mobileMoreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="absolute bottom-[60px] left-0 right-0 bg-white rounded-t-2xl shadow-2xl p-4 safe-area-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-4 gap-3">
              {mobileExtraItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl p-3 text-[11px] font-medium transition-colors",
                      active ? "bg-blue-50 text-[#2563EB]" : "text-[#6B7280] hover:bg-gray-50"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="truncate max-w-[64px] text-center">{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
