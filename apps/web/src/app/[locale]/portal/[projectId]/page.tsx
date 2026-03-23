"use client";

import { useState, useEffect, use } from "react";
import { useTranslations } from "next-intl";
import { Building2, FileText, Map, ClipboardList, Lock, Loader2, AlertCircle, Phone, ShieldAlert, HardHat } from "lucide-react";
import { ReportForm } from "@/components/portal/ReportForm";

// Inline tab components to keep it simple
// Tab 1: Chantier (site info)
function SiteTab({ projectId }: { projectId: string }) {
  const t = useTranslations("portal");
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/${projectId}/info`)
      .then(r => r.json())
      .then(d => setInfo(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  if (!info || info.error) return <div className="p-4 text-center text-gray-500">Erreur de chargement</div>;

  const mapsUrl = info.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${info.address}, ${info.city || ""}`)}` : null;

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900">{info.name}</h2>
        {info.code && <p className="text-sm text-gray-500 mt-0.5">{info.code}</p>}
        <div className="mt-3 space-y-2">
          {info.address && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">{t("address")}</p>
              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                  {info.address}{info.city ? `, ${info.city}` : ""}
                </a>
              ) : (
                <p className="text-sm text-gray-700">{info.address}{info.city ? `, ${info.city}` : ""}</p>
              )}
            </div>
          )}
        </div>
      </div>
      {info.description && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("instructions")}</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{info.description}</p>
        </div>
      )}
      {/* Numéros d'urgence */}
      <div className="bg-red-50 rounded-xl p-4 shadow-sm border border-red-100">
        <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Numéros d'urgence
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Urgences", number: "112" },
            { label: "Ambulance", number: "144" },
            { label: "Police", number: "117" },
            { label: "Pompiers", number: "118" },
            { label: "REGA", number: "1414" },
            { label: "Tox Info", number: "145" },
          ].map(({ label, number }) => (
            <a
              key={number}
              href={`tel:${number}`}
              className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 border border-red-100 active:bg-red-100 transition-colors"
            >
              <span className="text-sm text-gray-700">{label}</span>
              <span className="text-sm font-bold text-red-600">{number}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Règles de sécurité SUVA */}
      <div className="bg-amber-50 rounded-xl p-4 shadow-sm border border-amber-100">
        <h3 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          Règles de sécurité — SUVA
        </h3>
        <div className="space-y-2">
          {[
            { icon: "🪖", text: "Port du casque obligatoire sur le chantier" },
            { icon: "👟", text: "Chaussures de sécurité S3 obligatoires" },
            { icon: "🦺", text: "Gilet haute visibilité obligatoire" },
            { icon: "🧤", text: "Gants de protection selon les travaux" },
            { icon: "👓", text: "Lunettes de protection lors de travaux à risque" },
            { icon: "🔊", text: "Protection auditive en zone bruyante (>85 dB)" },
            { icon: "⛔", text: "Interdiction de travailler sous l'influence d'alcool ou de drogues" },
            { icon: "🚧", text: "Sécuriser les zones de travail et les fouilles" },
            { icon: "⚡", text: "Respecter les distances de sécurité avec les lignes électriques" },
            { icon: "🪜", text: "Ne jamais travailler en hauteur sans protection contre les chutes" },
          ].map(({ icon, text }, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-lg bg-white px-3 py-2 border border-amber-100">
              <span className="text-base shrink-0">{icon}</span>
              <span className="text-sm text-gray-700">{text}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-amber-600 mt-3 text-center">
          Chaque collaborateur a le droit de dire STOP en cas de danger — Règle vitale SUVA
        </p>
      </div>

      <div className="bg-blue-50 rounded-xl p-4 shadow-sm border border-blue-100">
        <h3 className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-2">
          <HardHat className="h-4 w-4" />
          En cas d'accident
        </h3>
        <ol className="space-y-1.5 text-sm text-gray-700 list-decimal list-inside">
          <li><strong>Protéger</strong> — Sécuriser la zone (baliser, couper les machines)</li>
          <li><strong>Alerter</strong> — Appeler le 144 (ambulance) ou le 112 (urgences)</li>
          <li><strong>Secourir</strong> — Premiers soins sans se mettre en danger</li>
          <li><strong>Informer</strong> — Prévenir le conducteur de travaux immédiatement</li>
        </ol>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">{t("welcome")}</p>
    </div>
  );
}

// Tab 2: Soumission (no prices)
function SubmissionTab({ projectId }: { projectId: string }) {
  const t = useTranslations("portal");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${projectId}/submission`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  if (!data || !data.groups || data.groups.length === 0) {
    return <div className="p-4 text-center text-gray-500">{t("noSubmission")}</div>;
  }

  const filtered = search.trim()
    ? data.groups.map((g: any) => ({
        ...g,
        items: g.items.filter((i: any) =>
          i.description?.toLowerCase().includes(search.toLowerCase()) ||
          i.number?.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((g: any) => g.items.length > 0)
    : data.groups;

  return (
    <div className="p-4 space-y-3">
      <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700 text-center">{t("noPrice")}</div>
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t("searchPosts")}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
      />
      {filtered.map((group: any) => (
        <div key={group.name} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setOpenGroup(openGroup === group.name ? null : group.name)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-semibold text-gray-900">{group.name}</span>
            <span className="text-xs text-gray-500">{group.count} {t("posts")}</span>
          </button>
          {openGroup === group.name && (
            <div className="border-t border-gray-100">
              {group.items.map((item: any) => (
                <div key={item.id} className="px-4 py-2.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-400">{item.number}</p>
                      <p className="text-sm text-gray-700 mt-0.5">{item.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-gray-900">{item.quantity || "—"}</p>
                      <p className="text-xs text-gray-500">{item.unit || ""}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Tab 3: Plans
function PlansTab({ projectId }: { projectId: string }) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/${projectId}/plans`)
      .then(r => r.json())
      .then(d => setPlans(d.plans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  if (plans.length === 0) return <div className="p-4 text-center text-gray-500">Aucun plan disponible</div>;

  return (
    <div className="p-4 space-y-3">
      {plans.map(plan => (
        <a
          key={plan.id}
          href={plan.file_url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-blue-200 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{plan.plan_title || plan.plan_number}</p>
              <p className="text-xs text-gray-500">{plan.discipline || plan.plan_type || ""}</p>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

// Main portal page
export default function PortalPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const t = useTranslations("portal");
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [userName, setUserName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("site");

  // Check if already authenticated (cookie exists)
  useEffect(() => {
    fetch(`/api/portal/${projectId}/info`)
      .then(r => {
        if (r.ok) {
          setAuthenticated(true);
          r.json().then(d => { if (d.userName) setUserName(d.userName); });
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [projectId]);

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
      const data = await res.json();
      if (res.ok) {
        setAuthenticated(true);
      } else {
        setError(data.code === "RATE_LIMITED" ? t("tooManyAttempts") : t("invalidPin"));
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // PIN entry screen
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-lg">
          <div className="text-center mb-6">
            <div className="h-14 w-14 mx-auto rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <Lock className="h-7 w-7 text-blue-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
            <p className="text-sm text-gray-500 mt-1">{t("enterPin")}</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-3">
            <input
              type="text"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              placeholder={t("yourNamePlaceholder")}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="tel"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("pinPlaceholder")}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={pin.length !== 6 || !userName.trim() || loading}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : t("access")}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Authenticated — 4-tab layout
  const tabs = [
    { id: "site", icon: Building2, label: t("tabSite") },
    { id: "submission", icon: ClipboardList, label: t("tabSubmission") },
    { id: "plans", icon: Map, label: t("tabPlans") },
    { id: "report", icon: FileText, label: t("tabReport") },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Content area */}
      <div className="flex-1 overflow-y-auto pb-20">
        {activeTab === "site" && <SiteTab projectId={projectId} />}
        {activeTab === "submission" && <SubmissionTab projectId={projectId} />}
        {activeTab === "plans" && <PlansTab projectId={projectId} />}
        {activeTab === "report" && <ReportForm projectId={projectId} />}
      </div>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 ${isActive ? "text-blue-600" : "text-gray-400"}`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
