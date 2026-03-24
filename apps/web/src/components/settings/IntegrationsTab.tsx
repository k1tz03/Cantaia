"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Mail,
  CheckCircle,
  RefreshCw,
  Loader2,
  Clock,
  Unlink,
  AlertCircle,
  Server,
  ChevronRight,
  ArrowLeft,
  Search,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useUserProfile } from "@/lib/hooks/use-supabase-data";
import { signInWithGoogleAction } from "@/app/[locale]/(auth)/actions";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-CH");
}

// Known IMAP provider presets
const KNOWN_PROVIDERS = [
  {
    id: "infomaniak",
    name: "Infomaniak",
    imap_host: "mail.infomaniak.com",
    imap_port: 993,
    imap_security: "ssl",
    smtp_host: "mail.infomaniak.com",
    smtp_port: 587,
    smtp_security: "tls",
  },
  {
    id: "hostpoint",
    name: "Hostpoint",
    imap_host: "imap.hostpoint.ch",
    imap_port: 993,
    imap_security: "ssl",
    smtp_host: "smtp.hostpoint.ch",
    smtp_port: 587,
    smtp_security: "tls",
  },
  {
    id: "ovh",
    name: "OVH",
    imap_host: "ssl0.ovh.net",
    imap_port: 993,
    imap_security: "ssl",
    smtp_host: "ssl0.ovh.net",
    smtp_port: 587,
    smtp_security: "tls",
  },
  {
    id: "bluewin",
    name: "Swisscom (Bluewin)",
    imap_host: "imaps.bluewin.ch",
    imap_port: 993,
    imap_security: "ssl",
    smtp_host: "smtpauths.bluewin.ch",
    smtp_port: 465,
    smtp_security: "ssl",
  },
] as const;

type ConnectionInfo = {
  provider: string;
  email_address: string;
  status: string;
  last_sync_at: string | null;
  total_emails_synced: number;
};

export function IntegrationsTab() {
  const t = useTranslations("settings");
  const { user } = useAuth();
  const profile = useUserProfile(user?.id);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [view, setView] = useState<"main" | "imap-select" | "imap-config">(
    "main"
  );
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // IMAP form state
  const [imapForm, setImapForm] = useState({
    email_address: "",
    imap_password: "",
    imap_host: "",
    imap_port: 993,
    imap_security: "ssl",
    smtp_host: "",
    smtp_port: 587,
    smtp_security: "tls",
  });
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
    emailCount?: number;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [checked, setChecked] = useState(false);

  // Determine if connected via legacy check or email_connections
  const isLegacyOutlook = !!profile?.profile?.microsoft_access_token;
  const hasConnection = !!connection || isLegacyOutlook;
  // Loading only while we're actively waiting for the connection check.
  // Once profile hook has loaded (even with no data) OR checked is true, stop loading.
  // This prevents infinite spinner when auth takes time to resolve.
  const loading = !checked && !hasConnection && !profile?.loaded;

  // Load email connection — runs when user becomes available
  useEffect(() => {
    if (!user?.id) return;

    fetch("/api/emails/get-connection")
      .then((r) => r.json())
      .then((data) => {
        if (data.connection) setConnection(data.connection);
      })
      .catch(() => {})
      .finally(() => setChecked(true));

    // If returning from OAuth, retry once after delay + clean URL
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "email") {
      setTimeout(() => {
        fetch("/api/emails/get-connection")
          .then((r) => r.json())
          .then((data) => {
            if (data.connection) setConnection(data.connection);
          })
          .catch(() => {});
      }, 2000);
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      window.history.replaceState({}, "", url.toString());
    }

    // Show connect error if any
    const connectError = params.get("connect_error");
    if (connectError) {
      setSyncMessage(`Erreur de connexion : ${decodeURIComponent(connectError)}`);
      const url = new URL(window.location.href);
      url.searchParams.delete("connect_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [user?.id]);

  const displayProvider = connection?.provider || (isLegacyOutlook ? "microsoft" : null);
  const displayEmail = connection?.email_address || user?.email || "";

  function getProviderLabel(p: string) {
    switch (p) {
      case "microsoft": return "Microsoft 365";
      case "google": return "Gmail / Google Workspace";
      case "imap": return "IMAP/SMTP";
      default: return p;
    }
  }

  function getProviderIcon(p: string) {
    switch (p) {
      case "microsoft":
        return (
          <svg className="h-5 w-5" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
        );
      case "google":
        return (
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        );
      default:
        return <Server className="h-5 w-5 text-muted-foreground" />;
    }
  }

  async function handleConnectMicrosoft() {
    setConnecting(true);
    try {
      // If user already has Microsoft tokens (logged in with Microsoft),
      // try to create the connection directly without another OAuth redirect.
      if (profile?.profile?.microsoft_access_token) {
        try {
          const res = await fetch("/api/emails/get-connection");
          const data = await res.json();
          if (data.connection) {
            setConnection(data.connection);
            return;
          }
        } catch { /* fall through to OAuth */ }
      }

      // Use direct Microsoft OAuth flow (bypasses Supabase provider_token
      // which is unreliable in PKCE mode). This route handles the full
      // OAuth flow and stores tokens directly.
      window.location.href = "/api/auth/microsoft-connect";
    } finally {
      setConnecting(false);
    }
  }

  async function handleConnectGoogle() {
    setConnecting(true);
    try {
      const orgId = profile?.profile?.organization_id;
      const result = await signInWithGoogleAction(orgId ? { linkToOrg: orgId } : undefined);
      if (result.url) window.location.href = result.url;
    } finally {
      setConnecting(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/outlook/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(
          `${data.emails_synced} emails, ${data.emails_classified} ${t("classified")}, ${data.tasks_created} ${t("tasksCreated")}`
        );
      } else {
        setSyncMessage(data.error || "Erreur");
      }
    } catch {
      setSyncMessage(t("connectionError"));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  }

  async function handleDisconnect() {
    try {
      await fetch("/api/emails/save-connection", { method: "DELETE" });
      setConnection(null);
      window.location.reload();
    } catch {
      // ignore
    }
  }

  function handleSelectKnownProvider(id: string) {
    const preset = KNOWN_PROVIDERS.find((p) => p.id === id);
    if (preset) {
      setSelectedProvider(id);
      setImapForm((f) => ({
        ...f,
        imap_host: preset.imap_host,
        imap_port: preset.imap_port,
        imap_security: preset.imap_security,
        smtp_host: preset.smtp_host,
        smtp_port: preset.smtp_port,
        smtp_security: preset.smtp_security,
      }));
    } else {
      setSelectedProvider("manual");
    }
    setView("imap-config");
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/emails/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "imap",
          ...imapForm,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveImapConnection() {
    setSaving(true);
    try {
      const res = await fetch("/api/emails/save-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "imap",
          ...imapForm,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConnection(data.connection);
        setView("main");
      }
    } finally {
      setSaving(false);
    }
  }

  function getRelativeSyncTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("justNow");
    if (mins < 60) return `${t("ago")} ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${t("ago")} ${hours}h`;
    return formatDate(dateStr);
  }

  // ── IMAP Provider Selection ─────────────────────────────────
  if (view === "imap-select") {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-background p-6">
          <button
            onClick={() => setView("main")}
            className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </button>
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            {t("emailSelectImapProvider")}
          </h3>
          <div className="space-y-2">
            {KNOWN_PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectKnownProvider(p.id)}
                className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium text-foreground">{p.name}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
            <button
              onClick={() => handleSelectKnownProvider("manual")}
              className="flex w-full items-center justify-between rounded-lg border border-dashed border-border px-4 py-3 text-left text-sm hover:bg-muted"
            >
              <span className="text-muted-foreground">{t("emailManualConfig")}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── IMAP Configuration Form ─────────────────────────────────
  if (view === "imap-config") {
    const providerName =
      KNOWN_PROVIDERS.find((p) => p.id === selectedProvider)?.name ||
      t("emailManualConfig");

    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-background p-6">
          <button
            onClick={() => setView("imap-select")}
            className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </button>
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            {providerName}
          </h3>

          <div className="space-y-4">
            {/* Email + Password */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("emailAddress")}
              </label>
              <input
                type="email"
                value={imapForm.email_address}
                onChange={(e) =>
                  setImapForm((f) => ({ ...f, email_address: e.target.value }))
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                placeholder="julien@monbureau.ch"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("emailPassword")}
              </label>
              <input
                type="password"
                value={imapForm.imap_password}
                onChange={(e) =>
                  setImapForm((f) => ({ ...f, imap_password: e.target.value }))
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
              />
            </div>

            {/* IMAP Settings */}
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                {t("emailImapServer")}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <input
                    type="text"
                    value={imapForm.imap_host}
                    onChange={(e) =>
                      setImapForm((f) => ({ ...f, imap_host: e.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                    placeholder="imap.example.com"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={imapForm.imap_port}
                    onChange={(e) =>
                      setImapForm((f) => ({
                        ...f,
                        imap_port: parseInt(e.target.value) || 993,
                      }))
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  />
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-xs">
                {(["ssl", "tls", "none"] as const).map((sec) => (
                  <label key={sec} className="flex items-center gap-1 text-muted-foreground">
                    <input
                      type="radio"
                      name="imap_security"
                      checked={imapForm.imap_security === sec}
                      onChange={() =>
                        setImapForm((f) => ({ ...f, imap_security: sec }))
                      }
                      className="accent-[#F97316]"
                    />
                    {sec.toUpperCase()}
                  </label>
                ))}
              </div>
              {selectedProvider && selectedProvider !== "manual" && (
                <p className="mt-1 text-[10px] text-green-600">
                  ✅ {t("emailPreFilled")}
                </p>
              )}
            </div>

            {/* SMTP Settings */}
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                {t("emailSmtpServer")}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <input
                    type="text"
                    value={imapForm.smtp_host}
                    onChange={(e) =>
                      setImapForm((f) => ({ ...f, smtp_host: e.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                    placeholder="smtp.example.com"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={imapForm.smtp_port}
                    onChange={(e) =>
                      setImapForm((f) => ({
                        ...f,
                        smtp_port: parseInt(e.target.value) || 587,
                      }))
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  />
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-xs">
                {(["ssl", "tls", "none"] as const).map((sec) => (
                  <label key={sec} className="flex items-center gap-1 text-muted-foreground">
                    <input
                      type="radio"
                      name="smtp_security"
                      checked={imapForm.smtp_security === sec}
                      onChange={() =>
                        setImapForm((f) => ({ ...f, smtp_security: sec }))
                      }
                      className="accent-[#F97316]"
                    />
                    {sec.toUpperCase()}
                  </label>
                ))}
              </div>
            </div>

            {/* Test + Save */}
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={
                  testing || !imapForm.email_address || !imapForm.imap_password
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {t("emailTestConnection")}
              </button>

              <button
                type="button"
                onClick={handleSaveImapConnection}
                disabled={!testResult?.success || saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dark disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("emailSaveConnection")}
              </button>
            </div>

            {/* Test result */}
            {testResult && (
              <div
                className={`rounded-md p-3 text-sm ${
                  testResult.success
                    ? "bg-green-500/10 text-green-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {testResult.success ? (
                  <>
                    <CheckCircle className="mb-1 inline h-4 w-4" />{" "}
                    {t("emailConnectionSuccess")}
                    {testResult.emailCount !== undefined && (
                      <span className="ml-1 text-green-500">
                        ({testResult.emailCount} emails)
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <AlertCircle className="mb-1 inline h-4 w-4" />{" "}
                    {testResult.error}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Main View ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {hasConnection && displayProvider ? (
        // ── Connected state ──
        <div className="rounded-lg border border-border bg-background p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              {getProviderIcon(displayProvider)}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {getProviderLabel(displayProvider)}
              </h3>
              <p className="text-xs text-muted-foreground">{displayEmail}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-foreground">
                {t("statusLabel")} :{" "}
                <span className="font-medium text-green-400">
                  {t("connected")}
                </span>
              </span>
            </div>

            {(connection?.last_sync_at || profile?.profile?.last_sync_at) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t("lastSync")} :{" "}
                {getRelativeSyncTime(
                  connection?.last_sync_at || profile?.profile?.last_sync_at || ""
                )}
              </div>
            )}

            {connection?.total_emails_synced !== undefined &&
              connection.total_emails_synced > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("emailsSynced")} : {connection.total_emails_synced}
                </p>
              )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dark disabled:opacity-50"
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("syncNow")}
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                <Unlink className="h-4 w-4" />
                {t("disconnect")}
              </button>
            </div>

            {syncMessage && (
              <p className="text-sm text-green-600">{syncMessage}</p>
            )}
          </div>
        </div>
      ) : loading ? (
        // ── Loading connection status ──
        <div className="rounded-lg border border-border bg-background p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[#F97316]" />
            <p className="text-sm text-muted-foreground">{t("emailConnecting")}</p>
          </div>
        </div>
      ) : (
        // ── Not connected — Provider selection ──
        <div className="rounded-lg border border-border bg-background p-6">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            {t("emailConnectTitle")}
          </h3>
          <p className="mb-6 text-sm text-muted-foreground">
            {t("emailConnectDesc")}
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            {/* Microsoft 365 */}
            <button
              type="button"
              onClick={handleConnectMicrosoft}
              disabled={connecting}
              className="flex flex-col items-center gap-3 rounded-lg border border-border p-5 text-center hover:border-primary/30 hover:bg-primary/10"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                {getProviderIcon("microsoft")}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Microsoft 365
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Outlook</p>
              </div>
            </button>

            {/* Gmail */}
            <button
              type="button"
              onClick={handleConnectGoogle}
              disabled={connecting}
              className="flex flex-col items-center gap-3 rounded-lg border border-border p-5 text-center hover:border-red-500/30 hover:bg-red-500/10"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                {getProviderIcon("google")}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Gmail</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Google Workspace
                </p>
              </div>
            </button>

            {/* IMAP/SMTP */}
            <button
              type="button"
              onClick={() => setView("imap-select")}
              className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-5 text-center hover:border-border hover:bg-muted"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Mail className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t("emailOtherImap")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">IMAP/SMTP</p>
              </div>
            </button>
          </div>

          {connecting && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("emailConnecting")}
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            {t("emailPrivacyNote")}
          </p>
        </div>
      )}
    </div>
  );
}
