"use client";

import { useState, useEffect, useMemo } from "react";
import { Users, Loader2, Search, Mail, Building2, Calendar, Sparkles, DollarSign } from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  organization_id: string;
  org_name?: string;
  created_at: string;
  last_sync_at?: string;
}

interface UserCost {
  user_id: string;
  calls: number;
  cost: number;
}

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userCosts, setUserCosts] = useState<Map<string, UserCost>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [period, setPeriod] = useState("30d");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/super-admin?action=all-users").then((r) => r.json()),
      fetch(`/api/super-admin?action=analytics&scope=platform&period=${period}`).then((r) => r.json()),
    ])
      .then(([usersData, analyticsData]) => {
        setUsers(usersData.users || []);
        const costMap = new Map<string, UserCost>();
        for (const u of (analyticsData.per_user || [])) {
          costMap.set(u.user_id, { user_id: u.user_id, calls: u.calls, cost: u.cost });
        }
        setUserCosts(costMap);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  // Unique orgs for filter dropdown
  const orgOptions = useMemo(() => {
    const orgs = new Map<string, string>();
    for (const u of users) {
      if (u.organization_id && u.org_name) {
        orgs.set(u.organization_id, u.org_name);
      }
    }
    return [...orgs.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [users]);

  const filtered = useMemo(() => {
    let result = users;

    // Org filter
    if (orgFilter !== "all") {
      result = result.filter((u) => u.organization_id === orgFilter);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((u) =>
        u.email.toLowerCase().includes(q) ||
        u.first_name?.toLowerCase().includes(q) ||
        u.last_name?.toLowerCase().includes(q) ||
        u.org_name?.toLowerCase().includes(q)
      );
    }

    // Sort by cost desc
    result = [...result].sort((a, b) => {
      const costA = userCosts.get(a.id)?.cost || 0;
      const costB = userCosts.get(b.id)?.cost || 0;
      return costB - costA;
    });

    return result;
  }, [users, search, orgFilter, userCosts]);

  const totalCost = useMemo(() => {
    let sum = 0;
    for (const c of userCosts.values()) sum += c.cost;
    return sum;
  }, [userCosts]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <Users className="h-6 w-6 text-amber-500" />
          Tous les utilisateurs
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {users.length} utilisateurs — Coût IA total: {totalCost.toFixed(2)} CHF
        </p>
      </div>

      {/* Filters row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email ou organisation..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
        >
          <option value="all">Toutes les orgs</option>
          {orgOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {p === "7d" ? "7j" : p === "30d" ? "30j" : "90j"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr>
                <th className="px-4 py-3">Utilisateur</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Organisation</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3 text-right">
                  <span className="flex items-center justify-end gap-1">
                    <Sparkles className="h-3 w-3" />
                    Appels IA
                  </span>
                </th>
                <th className="px-4 py-3 text-right">
                  <span className="flex items-center justify-end gap-1">
                    <DollarSign className="h-3 w-3" />
                    Coût IA
                  </span>
                </th>
                <th className="px-4 py-3">Inscrit le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => {
                const cost = userCosts.get(u.id);
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">
                          {(u.first_name?.[0] || "").toUpperCase()}{(u.last_name?.[0] || "").toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-800">
                          {u.first_name} {u.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {u.email}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {u.org_name ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          <Building2 className="h-3 w-3" />
                          {u.org_name}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          Solo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {cost ? cost.calls : 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {cost && cost.cost > 0 ? (
                        <span className="font-medium text-gray-800">{cost.cost.toFixed(4)} CHF</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {u.created_at ? new Date(u.created_at).toLocaleDateString("fr-CH") : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Aucun utilisateur trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
