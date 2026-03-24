"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Mail,
  CheckCircle,
  RefreshCw,
  Loader2,
  Clock,
  AlertCircle,
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
  const [view, setView] = useState<"main" | "imap-select" | "imap-config">("main");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

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

  const isLegacyOutlook = !!profile?.profile?.microsoft_access_token;
  const hasConnection = !!connection || isLegacyOutlook;
  const loading = !checked && !hasConnection && !profile?.loaded;

  useEffect(() => {
    if (!user?.id) return;

    fetch("/api/emails/get-connection")
      .then((r) => r.json())
      .then((data) => {
        if (data.connection) setConnection(data.connection);
      })
      .catch(() => {})
      .finally(() => setChecked(true));

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

  async function handleConnectMicrosoft() {
    setConnecting(true);
    try {
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
        body: JSON.stringify({ provider: "imap", ...imapForm }),
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
        body: JSON.stringify({ provider: "imap", ...imapForm }),
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
      <div className="space-y-4">
        <button
          onClick={() => setView("main")}
          className="flex items-center gap-1 text-[11px] text-[#71717A] hover:text-[#FAFAFA]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("back")}
        </button>
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] pb-2 border-b border-[#27272A]">
          {t("emailSelectImapProvider")}
        </div>
        <div className="space-y-2">
          {KNOWN_PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelectKnownProvider(p.id)}
              className="flex w-full items-center justify-between rounded-[10px] border border-[#27272A] bg-[#18181B] px-4 py-3 text-left text-[13px] hover:bg-[#1C1C1F]"
            >
              <span className="font-medium text-[#FAFAFA]">{p.name}</span>
              <ChevronRight className="h-4 w-4 text-[#71717A]" />
            </button>
          ))}
          <button
            onClick={() => handleSelectKnownProvider("manual")}
            className="flex w-full items-center justify-between rounded-[10px] border border-dashed border-[#27272A] bg-[#18181B] px-4 py-3 text-left text-[13px] hover:bg-[#1C1C1F]"
          >
            <span className="text-[#71717A]">{t("emailManualConfig")}</span>
            <ChevronRight className="h-4 w-4 text-[#71717A]" />
          </button>
        </div>
      </div>
    );
  }

  // ── IMAP Configuration Form ─────────────────────────────────
  if (view === "imap-config") {
    const providerName =
      KNOWN_PROVIDERS.find((p) => p.id === selectedProvider)?.name || t("emailManualConfig");

    return (
      <div className="space-y-4">
        <button
          onClick={() => setView("imap-select")}
          className="flex items-center gap-1 text-[11px] text-[#71717A] hover:text-[#FAFAFA]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("back")}
        </button>
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] pb-2 border-b border-[#27272A]">
          {providerName}
        </div>

        <div className="space-y-[14px]">
          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">{t("emailAddress")}</label>
            <input
              type="email"
              value={imapForm.email_address}
              onChange={(e) => setImapForm((f) => ({ ...f, email_address: e.target.value }))}
              className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] placeholder-[#52525B] outline-none focus:border-[#F97316]"
              placeholder="julien@monbureau.ch"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">{t("emailPassword")}</label>
            <input
              type="password"
              value={imapForm.imap_password}
              onChange={(e) => setImapForm((f) => ({ ...f, imap_password: e.target.value }))}
              className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] outline-none focus:border-[#F97316]"
            />
          </div>

          <div className="border-t border-[#27272A] pt-[14px]">
            <p className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-2">{t("emailImapServer")}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <input type="text" value={imapForm.imap_host} onChange={(e) => setImapForm((f) => ({ ...f, imap_host: e.target.value }))} className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] placeholder-[#52525B] outline-none focus:border-[#F97316]" placeholder="imap.example.com" />
              </div>
              <div>
                <input type="number" value={imapForm.imap_port} onChange={(e) => setImapForm((f) => ({ ...f, imap_port: parseInt(e.target.value) || 993 }))} className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] outline-none focus:border-[#F97316]" />
              </div>
            </div>
            <div className="mt-2 flex gap-4 text-[11px]">
              {(["ssl", "tls", "none"] as const).map((sec) => (
                <label key={sec} className="flex items-center gap-1 text-[#A1A1AA]">
                  <input type="radio" name="imap_security" checked={imapForm.imap_security === sec} onChange={() => setImapForm((f) => ({ ...f, imap_security: sec }))} className="accent-[#F97316]" />
                  {sec.toUpperCase()}
                </label>
              ))}
            </div>
            {selectedProvider && selectedProvider !== "manual" && (
              <p className="mt-1 text-[10px] text-[#34D399]">{t("emailPreFilled")}</p>
            )}
          </div>

          <div className="border-t border-[#27272A] pt-[14px]">
            <p className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-2">{t("emailSmtpServer")}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <input type="text" value={imapForm.smtp_host} onChange={(e) => setImapForm((f) => ({ ...f, smtp_host: e.target.value }))} className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] placeholder-[#52525B] outline-none focus:border-[#F97316]" placeholder="smtp.example.com" />
              </div>
              <div>
                <input type="number" value={imapForm.smtp_port} onChange={(e) => setImapForm((f) => ({ ...f, smtp_port: parseInt(e.target.value) || 587 }))} className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] outline-none focus:border-[#F97316]" />
              </div>
            </div>
            <div className="mt-2 flex gap-4 text-[11px]">
              {(["ssl", "tls", "none"] as const).map((sec) => (
                <label key={sec} className="flex items-center gap-1 text-[#A1A1AA]">
                  <input type="radio" name="smtp_security" checked={imapForm.smtp_security === sec} onChange={() => setImapForm((f) => ({ ...f, smtp_security: sec }))} className="accent-[#F97316]" />
                  {sec.toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-[#27272A] pt-[14px]">
            <button type="button" onClick={handleTestConnection} disabled={testing || !imapForm.email_address || !imapForm.imap_password} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#3F3F46] bg-[#27272A] px-[14px] py-[6px] text-[11px] font-medium text-[#D4D4D8] hover:bg-[#3F3F46] disabled:opacity-50">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {t("emailTestConnection")}
            </button>
            <button type="button" onClick={handleSaveImapConnection} disabled={!testResult?.success || saving} className="inline-flex items-center gap-1.5 rounded-[7px] bg-gradient-to-r from-[#F97316] to-[#EA580C] px-[14px] py-[6px] text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("emailSaveConnection")}
            </button>
          </div>

          {testResult && (
            <div className={`rounded-[10px] p-3 text-[11px] ${testResult.success ? "bg-[#34D39910] text-[#34D399] border border-[#34D39930]" : "bg-[#EF444410] text-[#F87171] border border-[#EF444430]"}`}>
              {testResult.success ? (
                <><CheckCircle className="mb-0.5 inline h-3.5 w-3.5" /> {t("emailConnectionSuccess")}{testResult.emailCount !== undefined && <span className="ml-1">({testResult.emailCount} emails)</span>}</>
              ) : (
                <><AlertCircle className="mb-0.5 inline h-3.5 w-3.5" /> {testResult.error}</>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main View — 3 Connection Cards ───────────────────────────
  if (hasConnection && displayProvider) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-[10px] border border-[#27272A] bg-[#18181B] px-4 py-[14px]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: displayProvider === "microsoft" ? "#0078D4" : displayProvider === "google" ? "#EA4335" : "#27272A" }}>
            <span className="text-[16px] font-bold text-white">
              {displayProvider === "microsoft" ? "M" : displayProvider === "google" ? "G" : ""}
              {displayProvider !== "microsoft" && displayProvider !== "google" && <Mail className="h-5 w-5 text-[#A1A1AA]" />}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[#FAFAFA]">
              {displayProvider === "microsoft" ? "Microsoft 365" : displayProvider === "google" ? "Gmail" : "IMAP/SMTP"}
            </div>
            <div className="text-[11px] text-[#34D399] mt-[1px]">
              &#10003; {t("connected")} &middot; {displayEmail}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(connection?.last_sync_at || profile?.profile?.last_sync_at) && (
              <span className="text-[10px] text-[#71717A] hidden sm:inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {getRelativeSyncTime(connection?.last_sync_at || profile?.profile?.last_sync_at || "")}
              </span>
            )}
            <button type="button" onClick={handleSyncNow} disabled={syncing} className="inline-flex items-center gap-1 rounded-[7px] bg-gradient-to-r from-[#F97316] to-[#EA580C] px-3 py-[6px] text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {t("syncNow")}
            </button>
            <button type="button" onClick={handleDisconnect} className="rounded-[7px] border border-[#EF444430] px-3 py-[6px] text-[11px] font-medium text-[#F87171] hover:bg-[#EF444410]">
              {t("disconnect")}
            </button>
          </div>
        </div>
        {syncMessage && <p className="text-[11px] text-[#34D399] px-1">{syncMessage}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-[10px] border border-[#27272A] bg-[#18181B] p-[14px]">
        <Loader2 className="h-5 w-5 animate-spin text-[#F97316]" />
        <p className="text-[13px] text-[#71717A]">{t("emailConnecting")}</p>
      </div>
    );
  }

  // ── Not connected — 3 provider cards ──
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-[10px] border border-[#27272A] bg-[#18181B] px-4 py-[14px]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: "#0078D4" }}>
          <span className="text-[16px] font-bold text-white">M</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[#FAFAFA]">Microsoft 365</div>
          <div className="text-[11px] text-[#71717A] mt-[1px]">{t("notConnected") || "Non connect\u00e9"}</div>
        </div>
        <button type="button" onClick={handleConnectMicrosoft} disabled={connecting} className="rounded-[7px] bg-gradient-to-r from-[#F97316] to-[#EA580C] px-[14px] py-[6px] text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (t("connect") || "Connecter")}
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-[10px] border border-[#27272A] bg-[#18181B] px-4 py-[14px]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: "#EA4335" }}>
          <span className="text-[16px] font-bold text-white">G</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[#FAFAFA]">Gmail</div>
          <div className="text-[11px] text-[#71717A] mt-[1px]">{t("notConnected") || "Non connect\u00e9"}</div>
        </div>
        <button type="button" onClick={handleConnectGoogle} disabled={connecting} className="rounded-[7px] bg-gradient-to-r from-[#F97316] to-[#EA580C] px-[14px] py-[6px] text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (t("connect") || "Connecter")}
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-[10px] border border-[#27272A] bg-[#18181B] px-4 py-[14px]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#27272A]">
          <Mail className="h-5 w-5 text-[#A1A1AA]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[#FAFAFA]">IMAP / SMTP</div>
          <div className="text-[11px] text-[#71717A] mt-[1px]">{t("emailManualConnection") || "Connexion manuelle"}</div>
        </div>
        <button type="button" onClick={() => setView("imap-select")} className="rounded-[7px] border border-[#3F3F46] bg-[#27272A] px-[14px] py-[6px] text-[11px] font-medium text-[#D4D4D8] hover:bg-[#3F3F46]">
          {t("configure") || "Configurer"}
        </button>
      </div>

      {connecting && (
        <div className="flex items-center gap-2 text-[11px] text-[#71717A] px-1 pt-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("emailConnecting")}
        </div>
      )}
      <p className="text-[10px] text-[#52525B] px-1 pt-2">{t("emailPrivacyNote")}</p>
    </div>
  );
}
