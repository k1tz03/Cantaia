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
    <div className="min-h-screen bg-gray-50">
      {/* Header with tabs */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <h1 className="pt-6 text-2xl font-bold text-gray-900">
            {t("title")}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {t("overviewSubtitle")}
          </p>
          <div className="mt-4 flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
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
