"use client";

import { useState, useEffect } from "react";
import {
  Wrench,
  Loader2,
  RefreshCw,
  Newspaper,
  Clock,
  UserCheck,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  Play,
  Database,
  BarChart3,
  Bug,
  Merge,
  Shield,
} from "lucide-react";
import { Link } from "@/i18n/navigation";

interface UserOption {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  organization_name?: string;
}

interface ActionResult {
  success?: boolean;
  error?: string;
  message?: string;
}

function ActionResultBanner({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  if (result.success) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
        <CheckCircle className="h-4 w-4 shrink-0" />
        <span>{result.message || "Action executee avec succes"}</span>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{result.error || "Une erreur est survenue"}</span>
    </div>
  );
}

export default function SuperAdminOperationsPage() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Force sync state
  const [syncUserId, setSyncUserId] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<ActionResult | null>(null);

  // Force briefing state
  const [briefingUserId, setBriefingUserId] = useState("");
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingResult, setBriefingResult] = useState<ActionResult | null>(
    null
  );

  // CRON state
  const [cronLoading, setCronLoading] = useState<string | null>(null);
  const [cronResults, setCronResults] = useState<
    Record<string, ActionResult | null>
  >({});

  // Impersonate state
  const [impersonateUserId, setImpersonateUserId] = useState("");
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [impersonateResult, setImpersonateResult] =
    useState<ActionResult | null>(null);

  useEffect(() => {
    fetch("/api/super-admin?action=all-users")
      .then((r) => r.json())
      .then((data) => {
        const allUsers: UserOption[] = (data.users || []).map((u: any) => ({
          id: u.id,
          email: u.email || "",
          first_name: u.first_name || "",
          last_name: u.last_name || "",
          organization_name: u.organization_name || "",
        }));
        setUsers(allUsers);
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, []);

  async function handleForceSync() {
    if (!syncUserId) return;
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/super-admin/force-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: syncUserId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult({ success: true, message: "Sync declenche avec succes" });
      } else {
        setSyncResult({ error: data.error || "Echec du sync" });
      }
    } catch {
      setSyncResult({ error: "Erreur reseau" });
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleForceBriefing() {
    if (!briefingUserId) return;
    setBriefingLoading(true);
    setBriefingResult(null);
    try {
      const res = await fetch("/api/super-admin/force-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: briefingUserId }),
      });
      const data = await res.json();
      if (res.ok) {
        setBriefingResult({
          success: true,
          message: "Briefing genere avec succes",
        });
      } else {
        setBriefingResult({ error: data.error || "Echec du briefing" });
      }
    } catch {
      setBriefingResult({ error: "Erreur reseau" });
    } finally {
      setBriefingLoading(false);
    }
  }

  async function handleRunCron(cronName: string) {
    setCronLoading(cronName);
    setCronResults((prev) => ({ ...prev, [cronName]: null }));
    try {
      const res = await fetch("/api/super-admin/run-cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronName }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCronResults((prev) => ({
          ...prev,
          [cronName]: { success: true, message: `CRON ${cronName} execute` },
        }));
      } else {
        setCronResults((prev) => ({
          ...prev,
          [cronName]: { error: data.error || `Echec CRON ${cronName}` },
        }));
      }
    } catch {
      setCronResults((prev) => ({
        ...prev,
        [cronName]: { error: "Erreur reseau" },
      }));
    } finally {
      setCronLoading(null);
    }
  }

  async function handleImpersonate() {
    if (!impersonateUserId) return;
    setImpersonateLoading(true);
    setImpersonateResult(null);
    try {
      const res = await fetch("/api/super-admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: impersonateUserId }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, "_blank");
        setImpersonateResult({
          success: true,
          message: "Lien ouvert dans un nouvel onglet",
        });
      } else {
        setImpersonateResult({
          error: data.error || "Echec de la generation du lien",
        });
      }
    } catch {
      setImpersonateResult({ error: "Erreur reseau" });
    } finally {
      setImpersonateLoading(false);
    }
  }

  const userLabel = (u: UserOption) => {
    const name = `${u.first_name} ${u.last_name}`.trim();
    const org = u.organization_name ? ` (${u.organization_name})` : "";
    return name ? `${name} — ${u.email}${org}` : `${u.email}${org}`;
  };

  const cronJobs = [
    {
      name: "briefing",
      label: "Briefing quotidien",
      desc: "Genere les briefings pour tous les utilisateurs",
      icon: Newspaper,
    },
    {
      name: "sync",
      label: "Sync email",
      desc: "Synchronise les emails de tous les utilisateurs",
      icon: RefreshCw,
    },
    {
      name: "benchmarks",
      label: "Benchmarks C2",
      desc: "Agregation des benchmarks marche",
      icon: Database,
    },
    {
      name: "patterns",
      label: "Patterns C3",
      desc: "Extraction hebdomadaire des patterns IA",
      icon: BarChart3,
    },
  ];

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <Wrench className="h-6 w-6 text-amber-500" />
          Operations
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Outils d&apos;administration et actions manuelles
        </p>
      </div>

      {/* Section 1: Force Actions */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800">
          Actions forcees
        </h2>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Force Sync */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <RefreshCw className="h-4 w-4 text-blue-500" />
              Forcer sync email
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Declenche une synchronisation Outlook pour un utilisateur
            </p>
            <div className="mt-3 space-y-2">
              <select
                value={syncUserId}
                onChange={(e) => setSyncUserId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                disabled={loadingUsers}
              >
                <option value="">
                  {loadingUsers
                    ? "Chargement des utilisateurs..."
                    : "Selectionner un utilisateur"}
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
              <button
                onClick={handleForceSync}
                disabled={!syncUserId || syncLoading}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Lancer sync
              </button>
            </div>
            <ActionResultBanner result={syncResult} />
          </div>

          {/* Force Briefing */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Newspaper className="h-4 w-4 text-amber-500" />
              Forcer briefing
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Genere le briefing quotidien pour un utilisateur
            </p>
            <div className="mt-3 space-y-2">
              <select
                value={briefingUserId}
                onChange={(e) => setBriefingUserId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                disabled={loadingUsers}
              >
                <option value="">
                  {loadingUsers
                    ? "Chargement des utilisateurs..."
                    : "Selectionner un utilisateur"}
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
              <button
                onClick={handleForceBriefing}
                disabled={!briefingUserId || briefingLoading}
                className="flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {briefingLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Generer briefing
              </button>
            </div>
            <ActionResultBanner result={briefingResult} />
          </div>
        </div>

        {/* CRON Jobs */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Clock className="h-4 w-4 text-violet-500" />
            Executer CRON manuellement
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Lance les taches CRON planifiees sans attendre leur horaire
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cronJobs.map((cron) => {
              const Icon = cron.icon;
              const isLoading = cronLoading === cron.name;
              const result = cronResults[cron.name];
              return (
                <div
                  key={cron.name}
                  className="rounded-md border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">
                      {cron.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{cron.desc}</p>
                  <button
                    onClick={() => handleRunCron(cron.name)}
                    disabled={isLoading}
                    className="mt-2 flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    Executer
                  </button>
                  {result && (
                    <div
                      className={`mt-2 text-xs ${result.success ? "text-green-600" : "text-red-600"}`}
                    >
                      {result.success ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> OK
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />{" "}
                          {result.error || "Erreur"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Section 2: Impersonation */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800">
          Impersonation
        </h2>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <UserCheck className="h-4 w-4 text-red-500" />
            Se connecter en tant que
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Genere un lien de connexion pour se connecter en tant qu&apos;un
            autre utilisateur (ouvre un nouvel onglet)
          </p>
          <div className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <select
                value={impersonateUserId}
                onChange={(e) => setImpersonateUserId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                disabled={loadingUsers}
              >
                <option value="">
                  {loadingUsers
                    ? "Chargement des utilisateurs..."
                    : "Selectionner un utilisateur"}
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleImpersonate}
              disabled={!impersonateUserId || impersonateLoading}
              className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {impersonateLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Impersonner
            </button>
          </div>
          <ActionResultBanner result={impersonateResult} />
          <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              L&apos;impersonation est tracee dans les logs d&apos;audit. Chaque
              connexion genere un magic link unique.
            </span>
          </div>
        </div>
      </div>

      {/* Section 3: Diagnostics */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Diagnostics</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/super-admin"
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-amber-300 hover:bg-amber-50"
          >
            <Shield className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">
                Erreurs Sentry
              </p>
              <p className="text-xs text-gray-500">Voir le dashboard</p>
            </div>
          </Link>
          <Link
            href="/debug"
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"
          >
            <Bug className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">
                Debug classification
              </p>
              <p className="text-xs text-gray-500">
                Diagnostics classification emails
              </p>
            </div>
          </Link>
          <a
            href="/api/debug/microsoft-status"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-violet-300 hover:bg-violet-50"
          >
            <ExternalLink className="h-5 w-5 text-violet-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">
                Statut Microsoft
              </p>
              <p className="text-xs text-gray-500">OAuth tokens & connexions</p>
            </div>
          </a>
          <a
            href="/api/debug/org-merge"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-rose-300 hover:bg-rose-50"
          >
            <Merge className="h-5 w-5 text-rose-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">Merge orgs</p>
              <p className="text-xs text-gray-500">
                Outil de fusion organisations
              </p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
