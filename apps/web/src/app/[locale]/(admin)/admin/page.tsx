"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutDashboard, Users, CreditCard, Settings } from "lucide-react";
import AdminOverviewTab from "@/components/admin/AdminOverviewTab";
import AdminMembersTab from "@/components/admin/AdminMembersTab";
import AdminSubscriptionTab from "@/components/admin/AdminSubscriptionTab";
import AdminSettingsTab from "@/components/admin/AdminSettingsTab";

const TABS = [
  { id: "overview", icon: LayoutDashboard, labelKey: "overview" },
  { id: "members", icon: Users, labelKey: "members" },
  { id: "subscription", icon: CreditCard, labelKey: "subscription" },
  { id: "settings", icon: Settings, labelKey: "settings" },
] as const;

export default function AdminPage() {
  const t = useTranslations("admin");
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("tab") || "overview";
    }
    return "overview";
  });

  return (
    <div className="min-h-screen bg-[#0F0F11]">
      {/* Header with tabs */}
      <div className="border-b border-[#27272A] bg-[#0F0F11]">
        <div className="mx-auto max-w-7xl px-6">
          <h1 className="pt-6 text-2xl font-display font-extrabold text-[#FAFAFA]">
            {t("title")}
          </h1>
          <p className="mt-0.5 text-sm text-[#71717A]">
            {t("overviewSubtitle")}
          </p>
          <div className="mt-4 flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-[#F97316] text-[#F97316]"
                    : "border-transparent text-[#71717A] hover:text-[#D4D4D8]"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {activeTab === "overview" && <AdminOverviewTab />}
        {activeTab === "members" && <AdminMembersTab />}
        {activeTab === "subscription" && <AdminSubscriptionTab />}
        {activeTab === "settings" && <AdminSettingsTab />}
      </div>
    </div>
  );
}
