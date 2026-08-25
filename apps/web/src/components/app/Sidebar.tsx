"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { ThemeToggle } from "./ThemeToggle";
import { useActiveProject } from "@/lib/contexts/active-project-context";
import { useSidebarBadges } from "@/lib/hooks/use-badges";
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
  LayoutDashboard,
  Mail,
  CalendarDays,
  Truck,
  MessageSquare,
  MoreHorizontal,
  X,
  Newspaper,
  LifeBuoy,
  ClipboardList,
  FileSpreadsheet,
  Map,
} from "lucide-react";

type NavItemStatus = "active" | "coming_soon" | "locked";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ComponentType<any>;
  status: NavItemStatus;
  badge?: string;
  badgeColor?: "orange" | "red";
  badgeLabelKey?: string;
  group?: string;
  dataTour?: string;
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

  // One aggregated badge poll instead of four, with an automatic fallback
  // to the legacy endpoints while /api/badges is not deployed.
  const {
    mail: mailUnprocessed,
    drafts: draftCount,
    support: supportUnread,
    supplierAlerts: supplierAlertCount,
  } = useSidebarBadges(!!user?.id);

  // /admin est désormais gardé serveur par requireOrgAdmin (admin/director) — le lien suit la même règle
  const isOrgAdmin = ["director", "admin"].includes(userRole || "");
  const isSuperAdmin = !!user?.user_metadata?.is_superadmin || profileSuperAdmin;

  // Section: QUOTIDIEN
  const dailyItems: NavItem[] = [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, status: "active", dataTour: "nav-dashboard" },
    { href: "/mail", labelKey: "mail", icon: Mail, status: "active", badge: (mailUnprocessed + draftCount) > 0 ? String(mailUnprocessed + draftCount) : undefined, badgeColor: draftCount > 0 ? "orange" : "orange", dataTour: "nav-mail" },
    { href: "/calendar", labelKey: "calendar", icon: CalendarDays, status: "active", dataTour: "nav-calendar" },
    { href: "/briefing", labelKey: "briefing", icon: Newspaper, status: "active", dataTour: "nav-briefing" },
    { href: "/tasks", labelKey: "tasks", icon: CheckSquare, status: "active", dataTour: "nav-tasks" },
  ];

  // Section: RÉFÉRENTIELS
  const referenceItems: NavItem[] = [
    // /projects and /plans were only reachable from the mobile sheet or a
    // deep link — they belong in the desktop rail like everything else.
    { href: "/projects", labelKey: "projects", icon: FolderKanban, status: "active", dataTour: "nav-projects" },
    { href: "/submissions", labelKey: "submissions", icon: FileSpreadsheet, status: "active", dataTour: "nav-submissions" },
    { href: "/plans", labelKey: "plans", icon: Map, status: "active", dataTour: "nav-plans" },
    { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "active", badge: supplierAlertCount > 0 ? String(supplierAlertCount) : undefined, badgeColor: "red", dataTour: "nav-suppliers" },
    { href: "/site-reports", labelKey: "siteReports", icon: ClipboardList, status: "active" },
    { href: "/chat", labelKey: "assistantAi", icon: MessageSquare, status: "active", dataTour: "nav-chat" },
  ];

  const bottomItems: NavItem[] = [
    { href: "/support", labelKey: "support", icon: LifeBuoy, status: "active", badge: supportUnread > 0 ? String(supportUnread) : undefined, badgeColor: "orange", dataTour: "nav-support" },
    { href: "/settings", labelKey: "settings", icon: Settings, status: "active", dataTour: "nav-settings" },
  ];

  const userName = user?.user_metadata?.first_name || t("user");
  const userInitials = `${(user?.user_metadata?.first_name || "U")[0]}${(user?.user_metadata?.last_name || "")[0] || ""}`.toUpperCase();

  useEffect(() => {
    localStorage.setItem("cantaia_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  // Keyboard shortcut: Ctrl+B to toggle sidebar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setCollapsed((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function isActive(href: string): boolean {
    const pathWithoutLocale = pathname.replace(/^\/(fr|en|de)/, "");
    return pathWithoutLocale === href || pathWithoutLocale.startsWith(href + "/");
  }

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
              "flex items-center gap-3 rounded-[7px] px-[10px] py-[6px] text-[13px] font-medium cursor-not-allowed select-none",
              collapsed && "justify-center px-0"
            )}
            title={collapsed ? t(item.labelKey) : undefined}
          >
            <Icon className="h-[14px] w-[18px] shrink-0 text-[#A1A1AA]" />
            {!collapsed && (
              <>
                <span className="flex-1 text-[#A1A1AA]">{t(item.labelKey)}</span>
                {badgeText && (
                  <span className="text-[10px] font-medium bg-[#27272A] text-[#A1A1AA] px-[7px] py-[2px] rounded-full">
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
          data-tour={item.dataTour}
          className={cn(
            "flex items-center gap-3 rounded-[7px] px-[10px] py-[6px] text-[13px] font-medium transition-colors duration-150",
            active
              ? "bg-gradient-to-r from-[rgba(249,115,22,0.09)] to-transparent text-[#F97316] font-semibold"
              : "text-[#A1A1AA] hover:bg-[#1C1C1F] hover:text-[#D4D4D8]",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? t(item.labelKey) : undefined}
        >
          <span className="relative shrink-0">
            <Icon className={cn("h-[14px] w-[18px]", active ? "text-[#F97316]" : "text-[#A1A1AA]")} />
            {collapsed && badgeText && (
              <span className={cn(
                "absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[8px] font-bold",
                item.badgeColor === "red"
                  ? "bg-[#EF4444] text-white"
                  : "bg-[#F97316] text-[#0F0F11]"
              )}>
                {badgeText}
              </span>
            )}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1">{t(item.labelKey)}</span>
              {badgeText && (
                <span className={cn(
                  "text-[10px] font-semibold px-[7px] py-[2px] rounded-full min-w-[20px] text-center",
                  item.badgeColor === "red"
                    ? "bg-[#EF4444] text-white"
                    : "bg-[#F97316] text-[#0F0F11]"
                )}>
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
  const { activeProject } = useActiveProject();

  const mobileBottomItems: NavItem[] = [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, status: "active" },
    { href: "/mail", labelKey: "mail", icon: Mail, status: "active", badge: mailUnprocessed > 0 ? String(mailUnprocessed) : undefined },
    { href: "/chat", labelKey: "assistantAi", icon: MessageSquare, status: "active" },
  ];

  const mobileExtraItems: NavItem[] = [
    { href: "/briefing", labelKey: "briefing", icon: Newspaper, status: "active" },
    { href: "/tasks", labelKey: "tasks", icon: CheckSquare, status: "active" },
    { href: "/projects", labelKey: "projects", icon: FolderKanban, status: "active" },
    // Same icon as the desktop rail — Soumissions used to be a spreadsheet
    // on desktop and a clipboard here.
    { href: "/submissions", labelKey: "submissions", icon: FileSpreadsheet, status: "active" },
    { href: "/plans", labelKey: "plans", icon: Map, status: "active" },
    { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "active" },
    { href: "/site-reports", labelKey: "siteReports", icon: ClipboardList, status: "active" },
    ...((isOrgAdmin || isSuperAdmin) ? [
      { href: "/admin", labelKey: "admin", icon: Shield, status: "active" as NavItemStatus },
    ] : []),
    { href: "/settings", labelKey: "settings", icon: Settings, status: "active" },
  ];


  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-sidebar border-r border-[#27272A] transition-all duration-200 h-full",
          collapsed ? "w-[64px]" : "w-[220px]"
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className={cn(
          "border-b border-[#27272A] h-3"
        )}>
        </div>

        {/* Navigation */}
        {/* flex-col is what makes the `mt-auto` on the bottom group actually
            push it down — without it the bottom links just floated mid-list. */}
        <nav className="flex flex-1 flex-col overflow-y-auto p-[8px_6px]">
          {/* QUOTIDIEN */}
          <div className="mb-1">
            {!collapsed && (
              <p className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-wider px-[10px] pt-[8px] pb-[2px]">
                {t("sections.daily")}
              </p>
            )}
            <ul className="space-y-0.5">
              {dailyItems.map(renderNavItem)}
            </ul>
          </div>

          {/* Divider */}
          <div className="h-px bg-[#27272A] mx-[10px] my-[5px]" />

          {/* RÉFÉRENTIELS */}
          <div className="mb-1">
            {!collapsed && (
              <p className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-wider px-[10px] pt-[8px] pb-[2px]">
                {t("sections.references")}
              </p>
            )}
            <ul className="space-y-0.5">
              {referenceItems.map(renderNavItem)}
            </ul>
          </div>

          {/* Divider */}
          <div className="h-px bg-[#27272A] mx-[10px] my-[5px]" />

          {/* PROJET ACTIF */}
          <div data-tour="nav-projects">
            <ActiveProjectSection collapsed={collapsed} />
          </div>

          {/* Divider + Bottom items */}
          <div className="mt-auto pt-2">
            <div className="h-px bg-[#27272A] mx-[10px] my-[5px]" />
            <ul className="space-y-0.5">
              {bottomItems.map(renderNavItem)}
            </ul>
          </div>

          {/* Admin link — visible to director, admin, superadmin (aligné sur requireOrgAdmin) */}
          {(isOrgAdmin || isSuperAdmin) && (
            <div className="mt-1">
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 rounded-[7px] px-[10px] py-[6px] text-[13px] font-medium transition-colors",
                  isActive("/admin")
                    ? "bg-gradient-to-r from-[rgba(239,68,68,0.09)] to-transparent text-[#EF4444] font-semibold"
                    : "text-[#A1A1AA] hover:bg-[#1C1C1F] hover:text-[#D4D4D8]",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? t("admin") : undefined}
              >
                <Shield className="h-[14px] w-[18px] shrink-0" />
                {!collapsed && <span className="flex-1">{t("admin")}</span>}
              </Link>
            </div>
          )}
        </nav>

        {/* User & Collapse */}
        <div className="border-t border-[#27272A] p-3">
          {/* Theme Toggle */}
          <ThemeToggle collapsed={collapsed} />

          {collapsed ? (
            <div className="flex flex-col items-center gap-1.5 mb-1.5">
              <button
                onClick={signOut}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold bg-[#F97316]/15 text-[#F97316] hover:bg-[#F97316]/25 transition-colors"
                title={`${userName} — ${t("logout")}`}
              >
                {userInitials}
              </button>
            </div>
          ) : (
            <div className="mb-1.5 flex items-center gap-2 rounded-[7px] px-2 py-1.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold bg-[#F97316]/15 text-[#F97316]">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[#D4D4D8]">{userName}</p>
              </div>
              <button aria-label="Déconnexion"
                onClick={signOut}
                className="rounded-md p-1 text-[#A1A1AA] hover:bg-[#1C1C1F] hover:text-[#D4D4D8] transition-colors"
                title={t("logout")}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-[7px] px-3 py-2 text-xs font-medium transition-colors",
              "text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#D4D4D8]"
            )}
            title={collapsed ? `${t("expand")} (Ctrl+B)` : `${t("collapse")} (Ctrl+B)`}
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
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#27272A] bg-[#0F0F11]/95 backdrop-blur-md lg:hidden"
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
                  active ? "text-[#F97316]" : "text-[#A1A1AA] hover:text-[#FAFAFA]"
                )}
                aria-current={active ? "page" : undefined}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" />
                  {item.badge && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F97316] px-1 text-[9px] font-bold text-[#0F0F11]">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-[56px]">{t(item.labelKey)}</span>
              </Link>
            );
          })}
          {/* Active project — opens the project itself (or the project list
              when none is selected). This used to just toggle the "More"
              sheet, so two adjacent buttons did the exact same thing. */}
          <Link
            href={activeProject ? `/projects/${activeProject.id}` : "/projects"}
            onClick={() => setMobileMoreOpen(false)}
            aria-label={activeProject ? activeProject.name : t("selectProject")}
            className={cn(
              "relative flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors",
              isActive("/projects") ? "text-[#F97316]" : "text-[#A1A1AA] hover:text-[#FAFAFA]"
            )}
          >
            {activeProject ? (
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: activeProject.color || "#F97316" }}
              >
                {activeProject.name.charAt(0).toUpperCase()}
              </span>
            ) : (
              <FolderKanban className="h-6 w-6" />
            )}
            <span className="truncate max-w-[56px]">
              {activeProject ? activeProject.name.substring(0, 6) : t("selectProject").substring(0, 6)}
            </span>
          </Link>
          <button
            onClick={() => { setMobileMoreOpen(!mobileMoreOpen); }}
            className={cn(
              "relative flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors",
              mobileMoreOpen ? "text-[#F97316]" : "text-[#A1A1AA] hover:text-[#FAFAFA]"
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
              className="absolute bottom-[60px] left-0 right-0 bg-[#0F0F11] rounded-t-2xl shadow-2xl p-4"
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
                        active ? "bg-[#F97316]/10 text-[#F97316]" : "text-[#A1A1AA] hover:bg-[#27272A]"
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

    </>
  );
}
