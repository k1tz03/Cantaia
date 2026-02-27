"use client";

import { useState } from "react";
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

interface NavSection {
  labelKey: string;
  items: NavItem[];
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { user, signOut } = useAuth();
  const { branding } = useBranding();
  const emailCtx = useEmailContextSafe();
  const unreadEmailCount = emailCtx?.unreadCount || 0;

  const sections: NavSection[] = [
    {
      labelKey: "section.products",
      items: [
        { href: "/submissions", labelKey: "submissions", icon: FileSpreadsheet, status: "active", badgeLabelKey: "badge.new" },
        { href: "/mail", labelKey: "mail", icon: Mail, status: "active", badge: unreadEmailCount > 0 ? String(unreadEmailCount) : undefined, badgeLabelKey: unreadEmailCount > 0 ? undefined : "badge.new" },
        { href: "/pv-chantier", labelKey: "pv", icon: FileText, status: "active", badgeLabelKey: "badge.new" },
      ],
    },
    {
      labelKey: "section.workspace",
      items: [
        { href: "/projects", labelKey: "projects", icon: FolderKanban, status: "active" },
        { href: "/tasks", labelKey: "tasks", icon: CheckSquare, status: "active", badgeLabelKey: "badge.new" },
        { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, status: "coming_soon", badgeLabelKey: "badge.soon" },
      ],
    },
    {
      labelKey: "section.coming_soon",
      items: [
        { href: "/plans", labelKey: "plans", icon: Map, status: "locked", badgeLabelKey: "badge.soon" },
        { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "locked", badgeLabelKey: "badge.soon" },
        { href: "/pricing-intelligence", labelKey: "pricingIntelligence", icon: TrendingUp, status: "locked", badgeLabelKey: "badge.soon" },
      ],
    },
  ];

  const bottomItems: NavItem[] = [
    { href: "/settings", labelKey: "settings", icon: Settings, status: "active" },
  ];

  const userName = user?.user_metadata?.first_name || "Utilisateur";
  const userInitials = `${(user?.user_metadata?.first_name || "U")[0]}${(user?.user_metadata?.last_name || "")[0] || ""}`.toUpperCase();

  const isBranded = branding.brandingEnabled;
  const displayName = branding.customName || "Cantaia";

  function isActive(href: string): boolean {
    const pathWithoutLocale = pathname.replace(/^\/(fr|en|de)/, "");
    return pathWithoutLocale === href || pathWithoutLocale.startsWith(href + "/");
  }

  const sidebarStyle = isBranded
    ? { backgroundColor: branding.sidebarColor }
    : undefined;

  const logoIconStyle = isBranded
    ? { backgroundColor: branding.primaryColor }
    : undefined;

  const logoTextStyle = isBranded
    ? { color: branding.primaryColor }
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

  // Mobile: active products + key workspace items
  const mobileItems: NavItem[] = [
    { href: "/submissions", labelKey: "submissions", icon: FileSpreadsheet, status: "active" },
    { href: "/mail", labelKey: "mail", icon: Mail, status: "active" },
    { href: "/projects", labelKey: "projects", icon: FolderKanban, status: "active" },
    { href: "/tasks", labelKey: "tasks", icon: CheckSquare, status: "active" },
    { href: "/settings", labelKey: "settings", icon: Settings, status: "active" },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col border-r border-slate-200 transition-all duration-300 h-screen sticky top-0",
          collapsed ? "w-[72px]" : "w-[220px]",
          !isBranded && "bg-slate-50"
        )}
        style={sidebarStyle}
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
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white",
                  !isBranded && "bg-brand"
                )}
                style={logoIconStyle}
              >
                {displayName[0]}
              </div>
              {!collapsed && (
                <span
                  className={cn(
                    "text-base font-bold",
                    !isBranded && "text-slate-800"
                  )}
                  style={logoTextStyle}
                >
                  {displayName}
                </span>
              )}
            </>
          )}
        </div>

        {/* Navigation with sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {sections.map((section, sectionIndex) => (
            <div key={section.labelKey} className={cn(sectionIndex > 0 && "mt-4")}>
              {/* Section label */}
              {!collapsed && (
                <div className="px-3 py-1.5 mb-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    {t(section.labelKey)}
                  </p>
                </div>
              )}
              {collapsed && sectionIndex > 0 && (
                <div className="mx-3 mb-2 border-t border-slate-200" />
              )}
              <ul className="space-y-0.5">
                {section.items.map(renderNavItem)}
              </ul>
            </div>
          ))}

          {/* Bottom separator + settings */}
          <div className="mt-4 border-t border-slate-200 pt-3">
            <ul className="space-y-0.5">
              {bottomItems.map(renderNavItem)}
            </ul>
          </div>

          {/* Superadmin link */}
          {user?.user_metadata?.is_superadmin && (
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
                Plan Trial
              </span>
              <span className="ml-auto text-[11px] text-slate-400">
                12j restants
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
                title="Déconnexion"
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
                <span>Réduire</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-around px-2 py-1.5">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const isDisabled = item.status !== "active";

            if (isDisabled) {
              return (
                <div
                  key={item.href}
                  className="relative flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[10px] font-medium text-slate-300 cursor-not-allowed"
                >
                  <Icon className="h-5 w-5" />
                  <span>{t(item.labelKey)}</span>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[10px] font-medium transition-colors",
                  !isBranded && active && "text-brand",
                  !active && "text-slate-400 hover:text-slate-600"
                )}
                style={active && isBranded ? { color: branding.primaryColor } : undefined}
              >
                <Icon className="h-5 w-5" />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
