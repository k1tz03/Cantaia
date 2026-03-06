"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { useEmailContextSafe } from "@/lib/contexts/email-context";
import {
  Mail,
  FolderKanban,
  CheckSquare,
  Map,
  FileSpreadsheet,
  FileText,
  MessageSquare,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";

interface DashboardCard {
  href: string;
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
  color: string;
  badge?: string;
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const { user } = useAuth();
  const emailCtx = useEmailContextSafe();
  const unreadCount = emailCtx?.unreadCount || 0;

  const tn = useTranslations("nav");
  const firstName = user?.user_metadata?.first_name || tn("user");

  const cards: DashboardCard[] = [
    {
      href: "/mail",
      icon: Mail,
      titleKey: "cardMailTitle",
      descKey: "cardMailDesc",
      color: "bg-blue-500",
      badge: unreadCount > 0 ? String(unreadCount) : undefined,
    },
    {
      href: "/projects",
      icon: FolderKanban,
      titleKey: "cardProjectsTitle",
      descKey: "cardProjectsDesc",
      color: "bg-indigo-500",
    },
    {
      href: "/tasks",
      icon: CheckSquare,
      titleKey: "cardTasksTitle",
      descKey: "cardTasksDesc",
      color: "bg-amber-500",
    },
    {
      href: "/plans",
      icon: Map,
      titleKey: "cardPlansTitle",
      descKey: "cardPlansDesc",
      color: "bg-emerald-500",
    },
    {
      href: "/submissions",
      icon: FileSpreadsheet,
      titleKey: "cardSubmissionsTitle",
      descKey: "cardSubmissionsDesc",
      color: "bg-purple-500",
    },
    {
      href: "/suppliers",
      icon: Truck,
      titleKey: "cardSuppliersTitle",
      descKey: "cardSuppliersDesc",
      color: "bg-orange-500",
    },
    {
      href: "/cantaia-prix",
      icon: TrendingUp,
      titleKey: "cardPrixTitle",
      descKey: "cardPrixDesc",
      color: "bg-gold",
    },
    {
      href: "/pv-chantier",
      icon: FileText,
      titleKey: "cardPvTitle",
      descKey: "cardPvDesc",
      color: "bg-rose-500",
    },
    {
      href: "/chat",
      icon: MessageSquare,
      titleKey: "cardChatTitle",
      descKey: "cardChatDesc",
      color: "bg-cyan-500",
    },
  ];

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("welcome", { name: firstName })}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {t("welcomeSubtitle")}
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group relative flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${card.color} text-white`}>
                  <Icon className="h-5 w-5" />
                </div>
                {card.badge && (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    card.badge === "new"
                      ? "bg-gold/10 text-gold-dark"
                      : "bg-red-100 text-red-700"
                  }`}>
                    {card.badge === "new" ? t("badgeNew") : card.badge}
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-sm font-semibold text-gray-900 group-hover:text-brand">
                {t(card.titleKey as "welcome")}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                {t(card.descKey as "welcome")}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
