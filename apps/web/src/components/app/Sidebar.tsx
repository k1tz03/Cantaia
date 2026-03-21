"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useAuth } from "@/components/providers/AuthProvider";
import { useBranding } from "@/components/providers/BrandingProvider";
import { ThemeToggle } from "./ThemeToggle";
import { useEmailContextSafe } from "@/lib/contexts/email-context";
import { useActiveProject } from "@/lib/contexts/active-project-context";
import { ActiveProjectSection } from "./ActiveProjectSection";
import { cn } from "@cantaia/ui";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderKanban,
  CheckSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Shield,
  TrendingUp,
  LayoutDashboard,
  Mail,
  Truck,
  MessageSquare,
  MoreHorizontal,
  X,
  Newspaper,
  Plus,
  Camera,
  Mic,
  LifeBuoy,
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
  const { resolvedTheme } = useTheme();

  const [profileSuperAdmin, setProfileSuperAdmin] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);

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

  // Poll support unread count
  useEffect(() => {
    if (!user?.id) return;
    function fetchUnread() {
      fetch("/api/support/tickets/unread-count")
        .then((r) => r.json())
        .then((d) => setSupportUnread(d.count || 0))
        .catch(() => {});
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const isManager = ["project_manager", "director", "admin"].includes(userRole || "");
  const isSuperAdmin = !!user?.user_metadata?.is_superadmin || profileSuperAdmin;

  // Section: QUOTIDIEN
  const dailyItems: NavItem[] = [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, status: "active" },
    { href: "/mail", labelKey: "mail", icon: Mail, status: "active", badge: unreadEmailCount > 0 ? String(unreadEmailCount) : undefined },
    { href: "/briefing", labelKey: "briefing", icon: Newspaper, status: "active" },
  ];

  // Section: RÉFÉRENTIELS
  const referenceItems: NavItem[] = [
    { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "active" },
    { href: "/cantaia-prix", labelKey: "cantaiaPrix", icon: TrendingUp, status: "active" },
    { href: "/chat", labelKey: "assistantAi", icon: MessageSquare, status: "active" },
  ];

  const bottomItems: NavItem[] = [
    { href: "/support", labelKey: "support", icon: LifeBuoy, status: "active", badge: supportUnread > 0 ? String(supportUnread) : undefined },
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

  const sidebarStyle = isBranded && resolvedTheme !== "dark"
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
            <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground/50" />
            {!collapsed && (
              <>
                <span className="flex-1 text-muted-foreground/50">{t(item.labelKey)}</span>
                {badgeText && (
                  <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
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
              ? "bg-primary/10 text-primary border-l-[3px] border-l-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-0 border-l-0",
            active && collapsed && "bg-primary/10"
          )}
          style={active && isBranded ? { color: branding.primaryColor, backgroundColor: `${branding.primaryColor}10`, borderLeftColor: branding.primaryColor } : undefined}
          title={collapsed ? t(item.labelKey) : undefined}
        >
          <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground")} />
          {!collapsed && (
            <>
              <span className="flex-1">{t(item.labelKey)}</span>
              {badgeText && (
                <span className="text-[10px] font-semibold bg-primary text-white px-2 py-0.5 rounded-full min-w-[20px] text-center">
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
  const [fabOpen, setFabOpen] = useState(false);
  const { activeProject } = useActiveProject();
  const router = useRouter();

  const mobileBottomItems: NavItem[] = [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, status: "active" },
    { href: "/mail", labelKey: "mail", icon: Mail, status: "active", badge: unreadEmailCount > 0 ? String(unreadEmailCount) : undefined },
    { href: "/chat", labelKey: "assistantAi", icon: MessageSquare, status: "active" },
  ];

  const mobileExtraItems: NavItem[] = [
    { href: "/briefing", labelKey: "briefing", icon: Newspaper, status: "active" },
    { href: "/projects", labelKey: "projects", icon: FolderKanban, status: "active" },
    { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "active" },
    { href: "/cantaia-prix", labelKey: "cantaiaPrix", icon: TrendingUp, status: "active" },
    ...((isManager || isSuperAdmin) ? [
      { href: "/admin", labelKey: "admin", icon: Shield, status: "active" as NavItemStatus },
    ] : []),
    { href: "/settings", labelKey: "settings", icon: Settings, status: "active" },
  ];

  const fabActions = [
    { labelKey: "fabNewTask" as const, icon: CheckSquare, action: () => router.push("/tasks?create=true") },
    { labelKey: "fabTakePhoto" as const, icon: Camera, action: () => router.push("/visits/new") },
    { labelKey: "fabVoiceNote" as const, icon: Mic, action: () => router.push("/visits/new?mode=audio") },
  ];

  const handleFabAction = useCallback((action: () => void) => {
    action();
    setFabOpen(false);
  }, []);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col border-r border-border transition-all duration-200 h-screen sticky top-0",
          collapsed ? "w-[64px]" : "w-[240px]",
          !isBranded && "bg-background"
        )}
        style={sidebarStyle}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center border-b border-border h-14 px-4",
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
                <span className="font-display text-lg font-bold tracking-tight text-foreground">
                  Cantaia
                </span>
              )}
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {/* QUOTIDIEN */}
          <div className="mb-2">
            {!collapsed && (
              <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t("sections.daily")}
              </p>
            )}
            <ul className="space-y-0.5">
              {dailyItems.map(renderNavItem)}
            </ul>
          </div>

          {/* RÉFÉRENTIELS */}
          <div className="mb-2 border-t border-border pt-2">
            {!collapsed && (
              <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t("sections.references")}
              </p>
            )}
            <ul className="space-y-0.5">
              {referenceItems.map(renderNavItem)}
            </ul>
          </div>

          {/* PROJET ACTIF */}
          <div className="border-t border-border pt-2">
            <ActiveProjectSection collapsed={collapsed} />
          </div>

          {/* Settings */}
          <div className="mt-3 border-t border-border pt-3">
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
                    ? "bg-red-500/10 text-red-700"
                    : "text-muted-foreground hover:bg-red-500/10 hover:text-red-600",
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

        {/* Plan indicator — hidden for pro/enterprise plans */}

        {/* User & Collapse */}
        <div className="border-t border-border p-3">
          {/* Theme Toggle */}
          <ThemeToggle collapsed={collapsed} />

          {!collapsed && (
            <div className="mb-1.5 flex items-center gap-2 rounded-lg px-2 py-1.5">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold bg-primary/15 text-primary"
                style={isBranded ? { backgroundColor: `${branding.primaryColor}20`, color: branding.primaryColor } : undefined}
              >
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{userName}</p>
              </div>
              <button
                onClick={signOut}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title={t("logout")}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        role="navigation"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-evenly px-1 py-1">
          {mobileBottomItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
                style={active && isBranded ? { color: branding.primaryColor } : undefined}
                aria-current={active ? "page" : undefined}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" />
                  {item.badge && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-[56px]">{t(item.labelKey)}</span>
              </Link>
            );
          })}
          {/* Active Project button */}
          <button
            onClick={() => { setMobileMoreOpen(!mobileMoreOpen); setFabOpen(false); }}
            className={cn(
              "relative flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors",
              "text-muted-foreground hover:text-foreground"
            )}
          >
            {activeProject ? (
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: activeProject.color || "#2563EB" }}
              >
                {activeProject.name.charAt(0).toUpperCase()}
              </span>
            ) : (
              <FolderKanban className="h-6 w-6" />
            )}
            <span className="truncate max-w-[56px]">
              {activeProject ? activeProject.name.substring(0, 6) : t("selectProject").substring(0, 6)}
            </span>
          </button>
          <button
            onClick={() => { setMobileMoreOpen(!mobileMoreOpen); setFabOpen(false); }}
            className={cn(
              "relative flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors",
              mobileMoreOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
            aria-expanded={mobileMoreOpen}
            aria-label={t("more")}
          >
            {mobileMoreOpen ? <X className="h-6 w-6" /> : <MoreHorizontal className="h-6 w-6" />}
            <span className="truncate max-w-[56px]">{t("more")}</span>
          </button>
        </div>
      </nav>

      {/* Mobile More Sheet */}
      <AnimatePresence>
        {mobileMoreOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileMoreOpen(false)}>
            <motion.div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            />
            <motion.div
              className="absolute bottom-[60px] left-0 right-0 bg-background rounded-t-2xl shadow-2xl p-4"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
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
                        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="truncate max-w-[64px] text-center">{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FAB Backdrop */}
      <AnimatePresence>
        {fabOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setFabOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* FAB + Action Buttons */}
      <div className="fixed right-4 z-[51] bottom-20 md:bottom-6 lg:bottom-6" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {/* Expanded action buttons */}
        <AnimatePresence>
          {fabOpen && fabActions.map((fab, i) => {
            const FabIcon = fab.icon;
            return (
              <motion.button
                key={fab.labelKey}
                className="flex items-center gap-3 mb-3 group"
                initial={{ opacity: 0, scale: 0.3, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.3, y: 20 }}
                transition={{ delay: (fabActions.length - 1 - i) * 0.05, type: "spring", damping: 20, stiffness: 300 }}
                onClick={() => handleFabAction(fab.action)}
              >
                <span className="rounded-lg bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-lg whitespace-nowrap">
                  {t(fab.labelKey)}
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-background shadow-lg text-primary transition-colors group-hover:bg-primary/10">
                  <FabIcon className="h-5 w-5" />
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>

        {/* FAB button */}
        <motion.button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          onClick={() => { setFabOpen(!fabOpen); setMobileMoreOpen(false); }}
          animate={{ rotate: fabOpen ? 45 : 0 }}
          transition={{ type: "spring", damping: 15, stiffness: 200 }}
          aria-label={fabOpen ? "Close" : "Actions"}
          aria-expanded={fabOpen}
        >
          <Plus className="h-7 w-7" />
        </motion.button>
      </div>
    </>
  );
}
