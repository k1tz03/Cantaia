"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { useEmailContextSafe } from "@/lib/contexts/email-context";
import {
  Mail,
  FolderKanban,
  CheckSquare,
  FileSpreadsheet,
  FileText,
  MessageSquare,
  TrendingUp,
  Truck,
  Map,
  type LucideIcon,
} from "lucide-react";

interface StatCard {
  icon: LucideIcon;
  value: string;
  label: string;
  iconBg: string;
  iconColor: string;
  href: string;
}

interface ModuleCard {
  href: string;
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
  iconBg: string;
  iconColor: string;
  badge?: string;
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const { user } = useAuth();
  const emailCtx = useEmailContextSafe();
  const unreadCount = emailCtx?.unreadCount || 0;

  const tn = useTranslations("nav");
  const firstName = user?.user_metadata?.first_name || tn("user");

  const stats: StatCard[] = [
    { icon: Mail, value: unreadCount > 0 ? String(unreadCount) : "0", label: "Emails non lus", iconBg: "bg-blue-50", iconColor: "text-[#2563EB]", href: "/mail" },
    { icon: CheckSquare, value: "12", label: "Tâches en cours", iconBg: "bg-green-50", iconColor: "text-[#10B981]", href: "/tasks" },
    { icon: FileText, value: "3", label: "PV cette semaine", iconBg: "bg-amber-50", iconColor: "text-[#F59E0B]", href: "/pv-chantier" },
    { icon: FolderKanban, value: "5", label: "Projets actifs", iconBg: "bg-purple-50", iconColor: "text-purple-600", href: "/projects" },
  ];

  const modules: ModuleCard[] = [
    { href: "/mail", icon: Mail, titleKey: "cardMailTitle", descKey: "cardMailDesc", iconBg: "bg-blue-50", iconColor: "text-[#2563EB]", badge: unreadCount > 0 ? String(unreadCount) : undefined },
    { href: "/tasks", icon: CheckSquare, titleKey: "cardTasksTitle", descKey: "cardTasksDesc", iconBg: "bg-green-50", iconColor: "text-[#10B981]" },
    { href: "/pv-chantier", icon: FileText, titleKey: "cardPvTitle", descKey: "cardPvDesc", iconBg: "bg-amber-50", iconColor: "text-[#F59E0B]" },
    { href: "/projects", icon: FolderKanban, titleKey: "cardProjectsTitle", descKey: "cardProjectsDesc", iconBg: "bg-purple-50", iconColor: "text-purple-600" },
    { href: "/plans", icon: Map, titleKey: "cardPlansTitle", descKey: "cardPlansDesc", iconBg: "bg-rose-50", iconColor: "text-rose-600" },
    { href: "/submissions", icon: FileSpreadsheet, titleKey: "cardSubmissionsTitle", descKey: "cardSubmissionsDesc", iconBg: "bg-indigo-50", iconColor: "text-indigo-600" },
    { href: "/suppliers", icon: Truck, titleKey: "cardSuppliersTitle", descKey: "cardSuppliersDesc", iconBg: "bg-amber-50", iconColor: "text-[#F59E0B]" },
    { href: "/cantaia-prix", icon: TrendingUp, titleKey: "cardPrixTitle", descKey: "cardPrixDesc", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
    { href: "/chat", icon: MessageSquare, titleKey: "cardChatTitle", descKey: "cardChatDesc", iconBg: "bg-cyan-50", iconColor: "text-cyan-600" },
  ];

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="font-display text-[28px] font-bold text-[#111827]">
          {t("welcome", { name: firstName })}
        </h1>
        <p className="mt-1 text-base text-[#6B7280]">
          {t("welcomeSubtitle")}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 mb-8 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.href}
              href={stat.href}
              className="flex items-center gap-4 rounded-xl border border-[#E5E7EB] bg-white p-5 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-blue-200"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.iconBg}`}>
                <Icon className={`h-5 w-5 ${stat.iconColor}`} />
              </div>
              <div>
                <div className="font-display text-2xl font-bold text-[#111827]">{stat.value}</div>
                <div className="text-sm text-[#6B7280]">{stat.label}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Module shortcuts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group flex items-start gap-4 rounded-xl border border-[#E5E7EB] bg-white p-4 transition-all hover:shadow-sm hover:border-blue-200"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[#111827] group-hover:text-[#2563EB] transition-colors">
                    {t(card.titleKey as "welcome")}
                  </h3>
                  {card.badge && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      {card.badge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[#6B7280] leading-relaxed">
                  {t(card.descKey as "welcome")}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
