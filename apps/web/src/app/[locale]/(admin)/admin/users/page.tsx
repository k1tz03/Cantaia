"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Users,
  Search,
  ArrowUpDown,
  ChevronDown,
} from "lucide-react";
// Mock data removed — will be replaced by real API calls
const mockAdminUsers: {
  id: string; name: string; email: string; role: string;
  organization_id: string; organization_name: string;
  last_login: string; emails_classified: number; cost_month_chf: number;
}[] = [];
const mockAdminOrgs: { id: string; name: string }[] = [];

type SortKey = "name" | "last_login" | "emails_classified" | "cost_month_chf";
type SortDir = "asc" | "desc";
type Segment = "all" | "active_today" | "active_week" | "inactive_7d" | "inactive_30d";

export default function AdminUsersPage() {
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [sortKey, setSortKey] = useState<SortKey>("cost_month_chf");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterOrg, setFilterOrg] = useState<string>("all");

  const now = Date.now();

  const users = useMemo(() => {
    let list = [...mockAdminUsers];

    // Search
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(s) ||
          u.email.toLowerCase().includes(s) ||
          u.organization_name.toLowerCase().includes(s)
      );
    }

    // Org filter
    if (filterOrg !== "all") {
      list = list.filter((u) => u.organization_id === filterOrg);
    }

    // Segment filter
    if (segment !== "all") {
      list = list.filter((u) => {
        const daysSince = Math.floor(
          (now - new Date(u.last_login).getTime()) / 86400000
        );
        switch (segment) {
          case "active_today":
            return daysSince === 0;
          case "active_week":
            return daysSince <= 7;
          case "inactive_7d":
            return daysSince > 7;
          case "inactive_30d":
            return daysSince > 30;
          default:
            return true;
        }
      });
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "last_login":
          cmp =
            new Date(a.last_login).getTime() -
            new Date(b.last_login).getTime();
          break;
        case "emails_classified":
          cmp = a.emails_classified - b.emails_classified;
          break;
        case "cost_month_chf":
          cmp = a.cost_month_chf - b.cost_month_chf;
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [search, segment, sortKey, sortDir, filterOrg, now]);

  // Segment counts
  const segmentCounts = useMemo(() => {
    const all = mockAdminUsers;
    return {
      all: all.length,
      active_today: all.filter(
        (u) =>
          Math.floor((now - new Date(u.last_login).getTime()) / 86400000) === 0
      ).length,
      active_week: all.filter(
        (u) =>
          Math.floor((now - new Date(u.last_login).getTime()) / 86400000) <= 7
      ).length,
      inactive_7d: all.filter(
        (u) =>
          Math.floor((now - new Date(u.last_login).getTime()) / 86400000) > 7
      ).length,
      inactive_30d: all.filter(
        (u) =>
          Math.floor((now - new Date(u.last_login).getTime()) / 86400000) > 30
      ).length,
    };
  }, [now]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function formatRelativeDate(iso: string) {
    const days = Math.floor(
      (now - new Date(iso).getTime()) / 86400000
    );
    if (days === 0) return t("today");
    if (days === 1) return t("yesterday");
    return t("daysAgo", { days });
  }

  const segments: { key: Segment; labelKey: string }[] = [
    { key: "all", labelKey: "usersTotal" },
    { key: "active_today", labelKey: "usersActiveToday" },
    { key: "active_week", labelKey: "usersActiveWeek" },
    { key: "inactive_7d", labelKey: "usersInactive7d" },
    { key: "inactive_30d", labelKey: "usersInactive30d" },
  ];

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Users className="h-5 w-5 text-gray-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            {t("usersTitle")}
          </h1>
          <p className="text-sm text-gray-500">
            {t("usersTotal", { count: mockAdminUsers.length })}
          </p>
        </div>
      </div>

      {/* Segment tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {segments.map((seg) => (
          <button
            key={seg.key}
            onClick={() => {
              setSegment(seg.key);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              segment === seg.key
                ? "bg-gray-800 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t(seg.labelKey as any, { count: segmentCounts[seg.key] })}{" "}
            <span className="ml-1 opacity-60">
              ({segmentCounts[seg.key]})
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un utilisateur..."
            className="w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 outline-none focus:border-gray-300"
          />
        </div>
        <div className="relative">
          <select
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value)}
            className="appearance-none rounded-md border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700"
          >
            <option value="all">Toutes les organisations</option>
            {mockAdminOrgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <SortableHeader
                label={t("colUser")}
                sortKey="name"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <th className="px-4 py-2.5 text-left font-medium text-gray-500">
                {t("colOrg")}
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-500">
                {t("colRole")}
              </th>
              <SortableHeader
                label={t("colLastLogin")}
                sortKey="last_login"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortableHeader
                label={t("colEmailsClassified")}
                sortKey="emails_classified"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortableHeader
                label={t("colCostMonth")}
                sortKey="cost_month_chf"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((user) => {
              const daysSince = Math.floor(
                (now - new Date(user.last_login).getTime()) / 86400000
              );
              const isInactive = daysSince > 7;

              return (
                <tr
                  key={user.id}
                  className={`transition-colors hover:bg-gray-50 ${
                    isInactive ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600">
                        {user.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">
                          {user.name}
                        </p>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {user.organization_name}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {formatRelativeDate(user.last_login)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-700">
                    {user.emails_classified}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-700">
                    {user.cost_month_chf.toFixed(2)} CHF
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        {users.length} utilisateur{users.length > 1 ? "s" : ""} affichés
      </p>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentKey === sortKey;
  return (
    <th className="px-4 py-2.5 text-left">
      <button
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 font-medium text-gray-500 hover:text-gray-700"
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${isActive ? "text-gray-700" : "text-gray-300"}`}
        />
        {isActive && (
          <span className="text-[10px]">
            {currentDir === "asc" ? "\u2191" : "\u2193"}
          </span>
        )}
      </button>
    </th>
  );
}
