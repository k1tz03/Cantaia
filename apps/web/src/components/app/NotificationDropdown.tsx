"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Mail, AlertTriangle, Users, Check, Sparkles } from "lucide-react";

interface AgentNotification {
  id: string;
  agent_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

const AGENT_ICONS: Record<string, { icon: typeof Mail; color: string; bg: string }> = {
  "email-drafter": { icon: Mail, color: "text-[#F97316]", bg: "bg-[#F97316]/10" },
  "followup-engine": { icon: AlertTriangle, color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10" },
  "supplier-monitor": { icon: Users, color: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10" },
  system: { icon: Sparkles, color: "text-[#A1A1AA]", bg: "bg-[#A1A1AA]/10" },
};

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  return new Date(dateStr).toLocaleDateString("fr-CH", { day: "numeric", month: "short" });
}

type FilterTab = "all" | "agents" | "system";

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/notifications?limit=30");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // Silently ignore
    }
  }, []);

  // Poll unread count every 60s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Fetch full list when dropdown opens
  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchNotifications().finally(() => setLoading(false));
    }
  }, [open, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const markAllRead = async () => {
    try {
      await fetch("/api/agents/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all_read: true }),
      });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      // Silently ignore
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await fetch("/api/agents/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_ids: [id] }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Silently ignore
    }
  };

  const filtered = notifications.filter((n) => {
    if (activeTab === "agents") return n.agent_type !== "system";
    if (activeTab === "system") return n.agent_type === "system";
    return true;
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "Tout" },
    { key: "agents", label: "Agents IA" },
    { key: "system", label: "Systeme" },
  ];

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-lg bg-[#18181B] border border-[#3F3F46] flex items-center justify-center hover:bg-[#27272A] transition-colors relative"
        aria-label="Notifications"
      >
        <Bell className="h-3.5 w-3.5 text-[#A1A1AA]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-[#EF4444] rounded-full text-[9px] font-semibold text-white flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-[380px] bg-[#18181B] border border-[#3F3F46] rounded-xl shadow-xl shadow-black/50 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272A]">
            <h3 className="text-[14px] font-semibold text-[#FAFAFA]">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-[#F97316] hover:text-[#FB923C] font-medium flex items-center gap-1"
              >
                <Check className="h-3 w-3" />
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#27272A]">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 text-center py-2 text-[12px] font-medium transition-colors ${
                  activeTab === tab.key
                    ? "text-[#F97316] border-b-2 border-[#F97316]"
                    : "text-[#71717A] hover:text-[#A1A1AA]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="w-5 h-5 border-2 border-[#3F3F46] border-t-[#F97316] rounded-full animate-spin mx-auto" />
                <p className="text-[12px] text-[#71717A] mt-2">Chargement...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="h-6 w-6 text-[#3F3F46] mx-auto mb-2" />
                <p className="text-[13px] text-[#71717A]">Aucune notification</p>
              </div>
            ) : (
              filtered.map((notification) => {
                const config = AGENT_ICONS[notification.agent_type] || AGENT_ICONS.system;
                const Icon = config.icon;
                const isUnread = !notification.read_at;

                return (
                  <button
                    key={notification.id}
                    onClick={() => {
                      if (isUnread) markAsRead(notification.id);
                    }}
                    className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-[#27272A]/50 transition-colors border-b border-[#27272A]/50 last:border-b-0 ${
                      isUnread ? "bg-[#F97316]/[0.03]" : ""
                    }`}
                  >
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon className={`h-4 w-4 ${config.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[13px] leading-tight ${isUnread ? "text-[#FAFAFA] font-medium" : "text-[#D4D4D8]"}`}>
                          {notification.title}
                        </p>
                        {isUnread && (
                          <span className="w-2 h-2 bg-[#F97316] rounded-full shrink-0 mt-1.5" />
                        )}
                      </div>
                      {notification.description && (
                        <p className="text-[11px] text-[#71717A] mt-0.5 line-clamp-2">
                          {notification.description}
                        </p>
                      )}
                      <p className="text-[10px] text-[#52525B] mt-1">
                        {formatRelative(notification.created_at)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
