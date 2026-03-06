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
} from "lucide-react";

type NavItemStatus = "active" | "coming_soon" | "locked";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
  status: NavItemStatus;
  badge?: string;
  badgeLabelKey?: string;
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

  // Fetch user role from DB to determine admin visibility
  useEffect(() => {
    if (!user?.id) return;
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((d) => { if (d.profile?.role) setUserRole(d.profile.role); })
      .catch(() => {});
  }, [user?.id]);

  const navItems: NavItem[] = [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, status: "active" },
    { href: "/projects", labelKey: "projects", icon: FolderKanban, status: "active" },
    { href: "/mail", labelKey: "mail", icon: Mail, status: "active", badge: unreadEmailCount > 0 ? String(unreadEmailCount) : undefined },
    { href: "/tasks", labelKey: "tasks", icon: CheckSquare, status: "active" },
    { href: "/plans", labelKey: "plans", icon: Map, status: "active" },
    { href: "/submissions", labelKey: "submissions", icon: FileSpreadsheet, status: "active" },
    { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "active" },
    { href: "/cantaia-prix", labelKey: "cantaiaPrix", icon: TrendingUp, status: "active" },
    { href: "/pv-chantier", labelKey: "pv", icon: FileText, status: "active" },
    { href: "/chat", labelKey: "chat", icon: MessageSquare, status: "active" },
  ];

  const lockedItems: NavItem[] = [
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
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium cursor-not-allowed select-none",
              collapsed && "justify-center px-0"
            )}
            title={collapsed ? t(item.labelKey) : undefined}
          >
            <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground/40" />
            {!collapsed && (
              <>
                <span className="flex-1 text-muted-foreground/40">{t(item.labelKey)}</span>
                {badgeText && (
                  <span className="text-[10px] font-medium bg-muted text-muted-foreground/60 px-1.5 py-0.5 rounded-full">
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
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-white shadow-sm"
              : "text-slate-600 hover:bg-white/70 hover:text-slate-900",
            !isBranded && active && "text-brand",
            collapsed && "justify-center px-0"
          )}
          style={active && isBranded ? { color: branding.primaryColor } : undefined}
          title={collapsed ? t(item.labelKey) : undefined}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1">{t(item.labelKey)}</span>
              {badgeText && (
                <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
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

  // Mobile: key items (4 + More button)
  const mobileItems: NavItem[] = [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, status: "active" },
    { href: "/mail", labelKey: "mail", icon: Mail, status: "active" },
    { href: "/projects", labelKey: "projects", icon: FolderKanban, status: "active" },
    { href: "/tasks", labelKey: "tasks", icon: CheckSquare, status: "active" },
  ];

  // Mobile: extra items shown in "More" sheet
  const mobileExtraItems: NavItem[] = [
    { href: "/plans", labelKey: "plans", icon: Map, status: "active" },
    { href: "/submissions", labelKey: "submissions", icon: FileSpreadsheet, status: "active" },
    { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "active" },
    { href: "/cantaia-prix", labelKey: "cantaiaPrix", icon: TrendingUp, status: "active" },
    { href: "/pv-chantier", labelKey: "pv", icon: FileText, status: "active" },
    { href: "/chat", labelKey: "chat", icon: MessageSquare, status: "active" },
    { href: "/settings", labelKey: "settings", icon: Settings, status: "active" },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col border-r border-steel/20 transition-all duration-300 h-screen sticky top-0",
          collapsed ? "w-[72px]" : "w-[220px]",
          !isBranded && "bg-parchment"
        )}
        style={sidebarStyle}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center border-b border-slate-200 h-14 px-4",
          collapsed ? "justify-center" : "gap-3"
        )}>
          {isBranded && branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={displayName}
              className="h-8 max-w-[140px] object-contain"
            />
          ) : (
            <>
              {collapsed ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="h-8 w-8">
                  <g strokeWidth="5" fill="none" strokeLinecap="round">
                    <ellipse cx="50" cy="50" rx="35" ry="12" transform="rotate(30 50 50)" stroke="#0A1F30" />
                    <ellipse cx="50" cy="50" rx="35" ry="12" transform="rotate(150 50 50)" stroke="#0A1F30" />
                    <ellipse cx="50" cy="50" rx="35" ry="12" transform="rotate(90 50 50)" stroke="#C4A661" />
                  </g>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 210" className="h-8 w-auto">
                  <g strokeWidth="5" fill="none" strokeLinecap="round">
                    <ellipse cx="125" cy="90" rx="55" ry="20" transform="rotate(30 125 90)" stroke="#0A1F30" />
                    <ellipse cx="125" cy="90" rx="55" ry="20" transform="rotate(150 125 90)" stroke="#0A1F30" />
                    <ellipse cx="125" cy="90" rx="55" ry="20" transform="rotate(90 125 90)" stroke="#C4A661" />
                  </g>
                  <text x="125" y="185" fontFamily="'Inter', sans-serif" fontWeight="800" fontSize="26" fill="#0A1F30" textAnchor="middle" letterSpacing="4">CANTAIA</text>
                </svg>
              )}
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-0.5">
            {navItems.map(renderNavItem)}
          </ul>

          {/* Locked items */}
          {lockedItems.length > 0 && (
            <div className="mt-3 border-t border-slate-200 pt-3">
              <ul className="space-y-0.5">
                {lockedItems.map(renderNavItem)}
              </ul>
            </div>
          )}

          {/* Settings */}
          <div className="mt-3 border-t border-slate-200 pt-3">
            <ul className="space-y-0.5">
              {bottomItems.map(renderNavItem)}
            </ul>
          </div>

          {/* Admin link — visible to org admins and superadmins */}
          {(userRole === "admin" || user?.user_metadata?.is_superadmin) && (
            <div className="mt-1">
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive("/admin")
                    ? "bg-red-50 text-red-700 shadow-sm"
                    : "text-slate-500 hover:bg-red-50/50 hover:text-red-600",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? "Admin" : undefined}
              >
                <Shield className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="flex-1">Admin</span>}
              </Link>
            </div>
          )}
        </nav>

        {/* Plan indicator */}
        {!collapsed && (
          <div className="mx-3 mb-2 rounded-md border border-slate-200 bg-white px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <Sparkles
                className={isBranded ? "h-3.5 w-3.5" : "h-3.5 w-3.5 text-amber-500"}
                style={isBranded ? { color: branding.accentColor } : undefined}
              />
              <span className="text-[11px] font-semibold text-slate-700">
                {t("planTrial")}
              </span>
              <span className="ml-auto text-[11px] text-slate-400">
                {t("trialDaysLeft", { days: 12 })}
              </span>
            </div>
          </div>
        )}

        {/* User & Collapse */}
        <div className="border-t border-slate-200 p-3">
          {!collapsed && (
            <div className="mb-1.5 flex items-center gap-2 rounded-md px-2 py-1.5">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                  !isBranded && "bg-brand"
                )}
                style={isBranded ? { backgroundColor: branding.primaryColor } : undefined}
              >
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-800">
                  {userName}
                </p>
              </div>
              <button
                onClick={signOut}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                title={t("logout")}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
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
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden safe-area-bottom" role="navigation" aria-label="Mobile navigation">
        <div className="flex items-center justify-evenly px-1 py-1">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                  !isBranded && active && "text-brand",
                  !active && "text-slate-400 hover:text-slate-600"
                )}
                style={active && isBranded ? { color: branding.primaryColor } : undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-[56px]">{t(item.labelKey)}</span>
              </Link>
            );
          })}
          {/* More button */}
          <button
            onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
            className={cn(
              "relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
              mobileMoreOpen ? "text-brand" : "text-slate-400 hover:text-slate-600"
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
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-[60px] left-0 right-0 bg-white rounded-t-2xl shadow-lg p-4 safe-area-bottom"
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
                      "flex flex-col items-center gap-1.5 rounded-lg p-3 text-[11px] font-medium transition-colors",
                      active ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-100"
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
