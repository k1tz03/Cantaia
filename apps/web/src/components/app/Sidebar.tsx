"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
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
  ClipboardList,
} from "lucide-react";

type NavItemStatus = "active" | "coming_soon" | "locked";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
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
  const emailCtx = useEmailContextSafe();
  const unreadEmailCount = emailCtx?.unreadCount || 0;

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
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, status: "active", dataTour: "nav-dashboard" },
    { href: "/mail", labelKey: "mail", icon: Mail, status: "active", badge: unreadEmailCount > 0 ? String(unreadEmailCount) : undefined, badgeColor: "orange", dataTour: "nav-mail" },
    { href: "/briefing", labelKey: "briefing", icon: Newspaper, status: "active", dataTour: "nav-briefing" },
    { href: "/tasks", labelKey: "tasks", icon: CheckSquare, status: "active", dataTour: "nav-tasks" },
  ];

  // Section: RÉFÉRENTIELS
  const referenceItems: NavItem[] = [
    { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "active", dataTour: "nav-suppliers" },
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
            <Icon className="h-[14px] w-[18px] shrink-0 text-[#52525B]" />
            {!collapsed && (
              <>
                <span className="flex-1 text-[#52525B]">{t(item.labelKey)}</span>
                {badgeText && (
                  <span className="text-[10px] font-medium bg-[#27272A] text-[#71717A] px-[7px] py-[2px] rounded-full">
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
          <Icon className={cn("h-[14px] w-[18px] shrink-0", active ? "text-[#F97316]" : "text-[#A1A1AA]")} />
          {!collapsed && (
            <>
              <span className="flex-1">{t(item.labelKey)}</span>
              {badgeText && (
                <span className={cn(
                  "text-[10px] font-semibold text-white px-[7px] py-[2px] rounded-full min-w-[20px] text-center",
                  item.badgeColor === "red" ? "bg-[#EF4444]" : "bg-[#F97316]"
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
    { href: "/tasks", labelKey: "tasks", icon: CheckSquare, status: "active" },
    { href: "/projects", labelKey: "projects", icon: FolderKanban, status: "active" },
    { href: "/submissions", labelKey: "submissions", icon: ClipboardList, status: "active", dataTour: "nav-submissions" },
    { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "active" },
    { href: "/site-reports", labelKey: "siteReports", icon: ClipboardList, status: "active" },
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
          "hidden lg:flex flex-col bg-sidebar border-r border-[#27272A] transition-all duration-200 h-screen sticky top-0",
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
        <nav className="flex-1 overflow-y-auto p-[8px_6px]">
          {/* QUOTIDIEN */}
          <div className="mb-1">
            {!collapsed && (
              <p className="text-[10px] font-semibold text-[#52525B] uppercase tracking-wider px-[10px] pt-[8px] pb-[2px]">
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
              <p className="text-[10px] font-semibold text-[#52525B] uppercase tracking-wider px-[10px] pt-[8px] pb-[2px]">
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

          {/* Admin link — visible to project_manager, director, admin, superadmin */}
          {(isManager || isSuperAdmin) && (
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

          {!collapsed && (
            <div className="mb-1.5 flex items-center gap-2 rounded-[7px] px-2 py-1.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold bg-[#F97316]/15 text-[#F97316]">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[#D4D4D8]">{userName}</p>
              </div>
              <button
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
            className="flex w-full items-center justify-center gap-2 rounded-[7px] px-3 py-2 text-xs font-medium text-[#A1A1AA] transition-colors hover:bg-[#1C1C1F] hover:text-[#D4D4D8]"
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
                  active ? "text-[#F97316]" : "text-[#71717A] hover:text-[#FAFAFA]"
                )}
                aria-current={active ? "page" : undefined}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" />
                  {item.badge && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F97316] px-1 text-[9px] font-bold text-white">
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
              "text-[#71717A] hover:text-[#FAFAFA]"
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
          </button>
          <button
            onClick={() => { setMobileMoreOpen(!mobileMoreOpen); setFabOpen(false); }}
            className={cn(
              "relative flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors",
              mobileMoreOpen ? "text-[#F97316]" : "text-[#71717A] hover:text-[#FAFAFA]"
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
                        active ? "bg-[#F97316]/10 text-[#F97316]" : "text-[#71717A] hover:bg-[#27272A]"
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
                <span className="rounded-lg bg-[#0F0F11] px-3 py-1.5 text-sm font-medium text-[#FAFAFA] shadow-lg whitespace-nowrap">
                  {t(fab.labelKey)}
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0F0F11] shadow-lg text-[#F97316] transition-colors group-hover:bg-[#F97316]/10">
                  <FabIcon className="h-5 w-5" />
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>

        {/* FAB button */}
        <motion.button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F97316] text-white shadow-lg hover:bg-[#EA580C] transition-colors focus:outline-none focus:ring-2 focus:ring-[#F97316] focus:ring-offset-2"
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
