"use client";

/**
 * Field portal — public surface, PIN-authenticated.
 *
 * Deliberately independent from the app shell: no next-intl (FR/DE come from a
 * local dictionary, see portal-i18n.tsx), no sidebar, no session. Everything is
 * sized for a phone held with gloves: 44px targets, 16px inputs, safe-area
 * padding under the bottom navigation.
 */

import { useState, useEffect, use } from "react";
import {
  AlertCircle,
  Ambulance,
  Biohazard,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Flame,
  HardHat,
  Loader2,
  MapPin,
  Plane,
  Search,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { ReportForm } from "@/components/portal/ReportForm";
import {
  PortalI18nProvider,
  usePortalI18n,
  PORTAL_LANGS,
  type PortalLang,
  type PortalKey,
} from "@/components/portal/portal-i18n";

// ── Language switch ─────────────────────────────────────────────────

function LangSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = usePortalI18n();
  return (
    <div
      role="group"
      aria-label="Langue / Sprache"
      className="flex shrink-0 overflow-hidden rounded-lg border border-[#3F3F46]"
    >
      {PORTAL_LANGS.map((code: PortalLang) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={
            (compact ? "min-h-[36px] px-2.5" : "min-h-[44px] px-3") +
            " text-[13px] font-bold uppercase transition-colors " +
            (lang === code
              ? "bg-[#F97316] text-[#0F0F11]"
              : "bg-[#18181B] text-[#A1A1AA]")
          }
        >
          {code}
        </button>
      ))}
    </div>
  );
}

// ── Tab 1: Chantier ─────────────────────────────────────────────────

function SiteTab({ projectId, onSessionExpired }: { projectId: string; onSessionExpired?: () => void }) {
  const { t } = usePortalI18n();
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/${projectId}/info`)
      .then(async (r) => {
        if (r.status === 401) {
          if (!cancelled) onSessionExpired?.();
          return null;
        }
        return r.json();
      })
      .then((d) => d && !cancelled && setInfo(d))
      .catch((e) => console.error("[portal] failed to load project info:", e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" aria-hidden="true" />
      </div>
    );
  }
  if (!info || info.error) {
    return <p className="p-4 text-center text-[14px] text-[#A1A1AA]">{t("loadError")}</p>;
  }

  const mapsUrl = info.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${info.address}, ${info.city || ""}`,
      )}`
    : null;

  const emergencies: Array<{ icon: React.ReactNode; label: PortalKey; number: string }> = [
    { icon: <Ambulance className="h-5 w-5" />, label: "emergencyAmbulance", number: "144" },
    { icon: <Flame className="h-5 w-5" />, label: "emergencyFire", number: "118" },
    { icon: <Shield className="h-5 w-5" />, label: "emergencyPolice", number: "117" },
    { icon: <Plane className="h-5 w-5" />, label: "emergencyRega", number: "1414" },
    { icon: <Biohazard className="h-5 w-5" />, label: "emergencyTox", number: "145" },
  ];

  const suvaRules: PortalKey[] = [
    "suvaRule1",
    "suvaRule2",
    "suvaRule3",
    "suvaRule4",
    "suvaRule5",
    "suvaRule6",
    "suvaRule7",
    "suvaRule8",
  ];

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Project card */}
      <section className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-[#A1A1AA]">
          {t("project")}
        </h2>
        <p className="mt-1 font-display text-[19px] font-bold text-[#FAFAFA]">{info.name}</p>
        {info.code && (
          <p className="mt-0.5 text-[14px] text-[#A1A1AA]">
            {info.code}
            {info.client_name ? ` · ${info.client_name}` : ""}
          </p>
        )}
        {info.address &&
          (mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex min-h-[48px] items-center gap-2 rounded-lg bg-[#27272A] px-3 text-[14px] text-[#93C5FD]"
            >
              <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1">
                {info.address}
                {info.city ? `, ${info.city}` : ""}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#A1A1AA]" aria-hidden="true" />
              <span className="sr-only">{t("openInMaps")}</span>
            </a>
          ) : (
            <p className="mt-3 flex min-h-[48px] items-center gap-2 rounded-lg bg-[#27272A] px-3 text-[14px] text-[#D4D4D8]">
              <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
              {info.address}
              {info.city ? `, ${info.city}` : ""}
            </p>
          ))}
      </section>

      {/* Instructions */}
      {info.description && (
        <section className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-[#A1A1AA]">
            {t("instructions")}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[#D4D4D8]">
            {info.description}
          </p>
        </section>
      )}

      {/* Emergency numbers */}
      <section className="rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/[0.07] p-4">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-[#FCA5A5]">
          <AlertCircle className="h-5 w-5" aria-hidden="true" />
          {t("emergencyNumbers")}
        </h2>
        <ul className="mt-2">
          {emergencies.map(({ icon, label, number }) => (
            <li key={number} className="border-b border-[#EF4444]/10 last:border-0">
              <a
                href={`tel:${number}`}
                className="flex min-h-[48px] items-center gap-3 text-[14px] text-[#D4D4D8]"
              >
                <span className="text-[#FCA5A5]" aria-hidden="true">
                  {icon}
                </span>
                <span className="flex-1">{t(label)}</span>
                <span className="font-display text-[16px] font-bold text-[#93C5FD]">{number}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* SUVA rules */}
      <section className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-[#FBBF24]">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          {t("suvaTitle")}
        </h2>
        <ul className="mt-2 space-y-1.5">
          {suvaRules.map((rule) => (
            <li key={rule} className="flex items-start gap-2 text-[14px] leading-snug text-[#D4D4D8]">
              <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full bg-[#FBBF24]" aria-hidden="true" />
              {t(rule)}
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg bg-[#F59E0B]/10 px-3 py-2 text-center text-[13px] font-semibold text-[#FBBF24]">
          {t("suvaStop")}
        </p>
      </section>

      <p className="pb-2 text-center text-[13px] text-[#A1A1AA]">{t("welcome")}</p>
    </div>
  );
}

// ── Tab 2: Soumission ───────────────────────────────────────────────

function SubmissionTab({ projectId, onSessionExpired }: { projectId: string; onSessionExpired?: () => void }) {
  const { t } = usePortalI18n();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/${projectId}/submission`)
      .then(async (r) => {
        if (r.status === 401) {
          if (!cancelled) onSessionExpired?.();
          return null;
        }
        return r.json();
      })
      .then((d) => d && !cancelled && setData(d))
      .catch((e) => console.error("[portal] failed to load data:", e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" aria-hidden="true" />
      </div>
    );
  }
  if (!data || !data.groups || data.groups.length === 0) {
    return <p className="p-4 text-center text-[14px] text-[#A1A1AA]">{t("noSubmission")}</p>;
  }

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? data.groups
        .map((g: any) => ({
          ...g,
          items: g.items.filter(
            (i: any) =>
              i.description?.toLowerCase().includes(needle) ||
              i.number?.toLowerCase().includes(needle) ||
              i.cfc_code?.toLowerCase().includes(needle),
          ),
        }))
        .filter((g: any) => g.items.length > 0)
    : data.groups;

  return (
    <div className="p-4">
      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPosts")}
          aria-label={t("searchPosts")}
          className="min-h-[48px] w-full rounded-lg border border-[#3F3F46] bg-[#18181B] pl-9 pr-3 text-[16px] text-[#FAFAFA] placeholder:text-[#A1A1AA] outline-none focus-visible:border-[#F97316]"
        />
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((group: any) => {
          const open = openGroup === group.name;
          return (
            <div
              key={group.name}
              className="overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B]"
            >
              <button
                type="button"
                onClick={() => setOpenGroup(open ? null : group.name)}
                aria-expanded={open}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left"
              >
                <span className="text-[15px] font-semibold text-[#FAFAFA]">{group.name}</span>
                <span className="shrink-0 rounded-md bg-[#27272A] px-2 py-0.5 text-[13px] text-[#D4D4D8]">
                  {group.count} {t("posts")}
                </span>
              </button>
              {open &&
                group.items.map((item: any) => (
                  <div key={item.id} className="border-t border-[#27272A] px-4 py-3">
                    <p className="font-mono text-[13px] text-[#A1A1AA]">
                      {item.number}
                      {item.cfc_code ? ` · CFC ${item.cfc_code}` : ""}
                    </p>
                    <p className="mt-1 text-[14px] leading-snug text-[#D4D4D8]">
                      {item.description}
                    </p>
                    <p className="mt-1 text-[13px] text-[#A1A1AA]">
                      {item.quantity ?? "—"} {item.unit || ""}
                    </p>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab 3: Plans ────────────────────────────────────────────────────

function PlansTab({ projectId, onSessionExpired }: { projectId: string; onSessionExpired?: () => void }) {
  const { t } = usePortalI18n();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/${projectId}/plans`)
      .then(async (r) => {
        if (r.status === 401) {
          if (!cancelled) onSessionExpired?.();
          return null;
        }
        return r.json();
      })
      .then((d) => d && !cancelled && setPlans(d.plans || []))
      .catch((e) => console.error("[portal] failed to load plans:", e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" aria-hidden="true" />
      </div>
    );
  }
  if (plans.length === 0) {
    return <p className="p-4 text-center text-[14px] text-[#A1A1AA]">{t("noPlans")}</p>;
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {plans.map((plan) => (
        <a
          key={plan.id}
          href={plan.file_url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[64px] items-center gap-3 rounded-xl border border-[#27272A] bg-[#18181B] px-4 py-3"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3B82F6]/10">
            <FileText className="h-5 w-5 text-[#60A5FA]" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-[#FAFAFA]">
              {plan.plan_title || plan.plan_number}
            </span>
            <span className="block text-[13px] text-[#A1A1AA]">
              {plan.discipline || plan.plan_type || ""}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-[#A1A1AA]" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────────

function PortalShell({ projectId }: { projectId: string }) {
  const { t } = usePortalI18n();
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [userName, setUserName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("site");

  // Already authenticated? (the session cookie is project-scoped)
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/${projectId}/info`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok) {
          setAuthenticated(true);
          if (d.userName) setUserName(d.userName);
          if (d.name) setProjectName(d.name);
          if (d.code) setProjectCode(d.code);
        } else {
          if (d.projectName) setProjectName(d.projectName);
          if (d.projectCode) setProjectCode(d.projectCode);
        }
      })
      .catch((e) => console.error("[portal] failed to check session:", e))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // A portal request came back 401: the 7-day session expired. Drop back to the
  // PIN screen with a clear message (localStorage drafts survive the reconnect).
  function handleSessionExpired() {
    setAuthenticated(false);
    setPin("");
    setError(t("sessionExpired"));
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pin.length !== 6 || !userName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${projectId}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, userName: userName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAuthenticated(true);
        if (data.projectName) setProjectName(data.projectName);
      } else {
        setError(data.code === "RATE_LIMITED" ? t("tooManyAttempts") : t("invalidPin"));
      }
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F0F11]">
        <Loader2 className="h-8 w-8 animate-spin text-[#F97316]" aria-hidden="true" />
      </div>
    );
  }

  // ── PIN screen ──
  if (!authenticated) {
    const canSubmit = pin.length === 6 && userName.trim().length >= 2 && !loading;
    return (
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col justify-center bg-gradient-to-b from-[#0F0F11] to-[#18181B] p-6">
        <div className="mb-4 flex justify-end">
          <LangSwitch compact />
        </div>

        <div className="flex flex-col items-center">
          <span
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#EF4444] font-display text-[22px] font-extrabold text-[#0F0F11]"
            aria-hidden="true"
          >
            C
          </span>
          <h1 className="text-center font-display text-[22px] font-extrabold text-[#FAFAFA]">
            {t("portalTitle")}
          </h1>
          {(projectName || projectCode) && (
            <p className="mt-1 text-center text-[14px] text-[#A1A1AA]">
              {projectName}
              {projectCode ? ` · ${projectCode}` : ""}
            </p>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/10 px-4 py-3 text-[14px] text-[#F87171]"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-5 flex flex-col gap-4">
          <div>
            <label
              htmlFor="portal-name"
              className="mb-1.5 block text-[13px] font-semibold text-[#D4D4D8]"
            >
              {t("yourName")}
            </label>
            <input
              id="portal-name"
              type="text"
              autoComplete="name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder={t("yourNamePlaceholder")}
              className="min-h-[52px] w-full rounded-xl border border-[#3F3F46] bg-[#27272A] px-4 text-[16px] text-[#FAFAFA] placeholder:text-[#A1A1AA] outline-none focus-visible:border-[#F97316]"
            />
          </div>

          <div>
            <label
              htmlFor="portal-pin"
              className="mb-1.5 block text-[13px] font-semibold text-[#D4D4D8]"
            >
              {t("pinCode")}
            </label>
            <input
              id="portal-pin"
              type="tel"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("pinPlaceholder")}
              className="min-h-[52px] w-full rounded-xl border border-[#3F3F46] bg-[#27272A] px-4 text-center font-display text-[18px] font-bold tracking-[0.5em] text-[#FAFAFA] placeholder:tracking-normal placeholder:text-[#A1A1AA] outline-none focus-visible:border-[#F97316]"
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className={
              "flex min-h-[52px] w-full items-center justify-center rounded-xl text-[16px] font-bold transition-opacity " +
              (canSubmit
                ? "bg-[#F97316] text-[#0F0F11]"
                : "bg-[#3F3F46] text-[#A1A1AA] opacity-70")
            }
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              t("access")
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-[13px] text-[#A1A1AA]">{t("pinHelp")}</p>
      </div>
    );
  }

  // ── Authenticated shell ──
  const tabs: Array<{ id: string; icon: React.ReactNode; label: PortalKey }> = [
    { id: "site", icon: <HardHat className="h-5 w-5" />, label: "tabSite" },
    { id: "submission", icon: <ClipboardList className="h-5 w-5" />, label: "tabSubmission" },
    { id: "plans", icon: <FileText className="h-5 w-5" />, label: "tabPlans" },
    { id: "report", icon: <ClipboardCheck className="h-5 w-5" />, label: "tabReport" },
  ];

  return (
    <div className="relative mx-auto flex min-h-screen max-w-[430px] flex-col bg-[#0F0F11] text-[#E4E4E7]">
      <header className="flex items-center gap-3 border-b border-[#27272A] bg-[#09090B] px-4 py-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#F97316] to-[#EF4444] font-display text-[15px] font-extrabold text-[#0F0F11]"
          aria-hidden="true"
        >
          C
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold text-[#FAFAFA]">
            {projectName || t("site")}
          </p>
          {userName && <p className="truncate text-[13px] text-[#A1A1AA]">{userName}</p>}
        </div>
        <LangSwitch compact />
      </header>

      <main className="flex-1 overflow-y-auto pb-[calc(76px+env(safe-area-inset-bottom))]">
        {activeTab === "site" && <SiteTab projectId={projectId} onSessionExpired={handleSessionExpired} />}
        {activeTab === "submission" && <SubmissionTab projectId={projectId} onSessionExpired={handleSessionExpired} />}
        {activeTab === "plans" && <PlansTab projectId={projectId} onSessionExpired={handleSessionExpired} />}
        {activeTab === "report" && (
          <ReportForm projectId={projectId} userName={userName} onSessionExpired={handleSessionExpired} />
        )}
      </main>

      <nav
        aria-label={t("portalTitle")}
        className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-[430px] -translate-x-1/2 border-t border-[#27272A] bg-[#09090B] pb-[env(safe-area-inset-bottom)]"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={
                "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 " +
                (isActive ? "text-[#F97316]" : "text-[#A1A1AA]")
              }
            >
              <span aria-hidden="true">{tab.icon}</span>
              <span className="text-[11px] font-semibold">{t(tab.label)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default function PortalPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  return (
    <PortalI18nProvider>
      <PortalShell projectId={projectId} />
    </PortalI18nProvider>
  );
}
