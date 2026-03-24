"use client";

import { useState, useEffect, use } from "react";
import { useTranslations } from "next-intl";
import { FileText, Loader2, AlertCircle } from "lucide-react";
import { ReportForm } from "@/components/portal/ReportForm";

// ─── Tab 1: Chantier ────────────────────────────────────────────────
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

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#F97316" }} />
    </div>
  );
  if (!info || info.error) return (
    <div className="p-4 text-center" style={{ color: "#71717A" }}>Erreur de chargement</div>
  );

  const mapsUrl = info.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${info.address}, ${info.city || ""}`)}`
    : null;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Project card */}
      <div style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#52525B", fontWeight: 600, marginBottom: 6 }}>
          Projet
        </div>
        <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 700, color: "#FAFAFA" }}>
          {info.name}
        </div>
        {info.code && (
          <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
            {info.code}{info.client_name ? ` · ${info.client_name}` : ""}
          </div>
        )}
        {info.address && (
          mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 6, marginTop: 8,
                padding: "8px 12px", background: "#27272A", borderRadius: 8,
                textDecoration: "none",
              }}
            >
              <span style={{ fontSize: 16 }}>📍</span>
              <span style={{ fontSize: 13, color: "#60A5FA", flex: 1 }}>
                {info.address}{info.city ? `, ${info.city}` : ""}
              </span>
              <span style={{ color: "#52525B", fontSize: 12 }}>›</span>
            </a>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, padding: "8px 12px", background: "#27272A", borderRadius: 8 }}>
              <span style={{ fontSize: 16 }}>📍</span>
              <span style={{ fontSize: 13, color: "#A1A1AA", flex: 1 }}>
                {info.address}{info.city ? `, ${info.city}` : ""}
              </span>
            </div>
          )
        )}
      </div>

      {/* Instructions card */}
      {info.description && (
        <div style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#52525B", fontWeight: 600, marginBottom: 6 }}>
            {t("instructions")}
          </div>
          <div style={{ fontSize: 13, color: "#D4D4D8", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {info.description}
          </div>
        </div>
      )}

      {/* Emergency numbers */}
      <div style={{
        background: "linear-gradient(135deg, #1C0909, #1A0505)",
        border: "1px solid rgba(239, 68, 68, 0.19)",
        borderRadius: 10, padding: "14px 16px",
      }}>
        <div style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: 700,
          color: "#F87171", display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
        }}>
          🚨 Num&eacute;ros d&apos;urgence
        </div>
        {[
          { icon: "🚑", label: "Ambulance / Urgences", number: "144", tel: "144" },
          { icon: "🚒", label: "Pompiers", number: "118", tel: "118" },
          { icon: "👮", label: "Police", number: "117", tel: "117" },
          { icon: "🛩️", label: "REGA", number: "1414", tel: "1414" },
          { icon: "☠️", label: "Tox Info", number: "145", tel: "145" },
        ].map(({ icon, label, number, tel }) => (
          <div key={tel} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
            borderBottom: "1px solid rgba(239, 68, 68, 0.08)",
          }}>
            <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{icon}</span>
            <span style={{ fontSize: 11, color: "#A1A1AA", flex: 1 }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              <a href={`tel:${tel}`} style={{ color: "#60A5FA", textDecoration: "none" }}>{number}</a>
            </span>
          </div>
        ))}
        {/* Conductor phone if available */}
        {info.conductor_phone && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
          }}>
            <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>📞</span>
            <span style={{ fontSize: 11, color: "#A1A1AA", flex: 1 }}>
              Conducteur{info.conductor_name ? ` (${info.conductor_name})` : ""}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              <a href={`tel:${info.conductor_phone}`} style={{ color: "#60A5FA", textDecoration: "none" }}>
                {info.conductor_phone}
              </a>
            </span>
          </div>
        )}
      </div>

      {/* SUVA safety rules */}
      <div style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: 700,
          color: "#FBBF24", display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
        }}>
          ⚠️ R&egrave;gles SUVA — S&eacute;curit&eacute; chantier
        </div>
        {[
          "Port du casque obligatoire en toutes circonstances",
          "Chaussures de sécurité S3 obligatoires",
          "Gilet haute visibilité obligatoire",
          "Protection auditive en zone de bruit > 85 dB",
          "Lunettes de protection pour travaux de meulage/découpe",
          "Harnais obligatoire au-dessus de 2 mètres",
          "Interdiction de travailler sous l'emprise d'alcool ou drogues",
          "Signaler tout accident/incident immédiatement",
        ].map((rule, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0", fontSize: 12, color: "#D4D4D8", lineHeight: 1.4 }}>
            <span style={{ color: "#FBBF24", fontSize: 12, marginTop: 1, flexShrink: 0 }}>☑</span>
            <span>{rule}</span>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "#D97706", textAlign: "center", marginTop: 10 }}>
          Chaque collaborateur a le droit de dire STOP en cas de danger
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: 11, color: "#3F3F46", marginTop: 8 }}>
        {t("welcome")}
      </p>
    </div>
  );
}

// ─── Tab 2: Soumission ──────────────────────────────────────────────
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

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#F97316" }} />
    </div>
  );
  if (!data || !data.groups || data.groups.length === 0) {
    return <div style={{ padding: 16, textAlign: "center", color: "#71717A" }}>{t("noSubmission")}</div>;
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
    <div style={{ padding: 16 }}>
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={"🔍 " + t("searchPosts")}
        style={{
          width: "100%", background: "#18181B", border: "1px solid #3F3F46",
          borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#D4D4D8",
          outline: "none", marginBottom: 12,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((group: any) => (
          <div key={group.name} style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 8, overflow: "hidden" }}>
            <button
              onClick={() => setOpenGroup(openGroup === group.name ? null : group.name)}
              type="button"
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", cursor: "pointer", background: "none", border: "none", color: "inherit",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA" }}>{group.name}</span>
              <span style={{ fontSize: 10, color: "#71717A", background: "#27272A", padding: "2px 6px", borderRadius: 4 }}>
                {group.count} {t("posts")}
              </span>
            </button>
            {openGroup === group.name && group.items.map((item: any) => (
              <div key={item.id} style={{ padding: "8px 12px", borderTop: "1px solid #27272A" }}>
                <div style={{ fontSize: 10, color: "#71717A", fontFamily: "monospace" }}>{item.number}</div>
                <div style={{ fontSize: 12, color: "#D4D4D8", marginTop: 2, lineHeight: 1.4 }}>{item.description}</div>
                <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 3 }}>
                  {item.quantity || "—"} {item.unit || ""}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab 3: Plans ───────────────────────────────────────────────────
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

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#F97316" }} />
    </div>
  );
  if (plans.length === 0) return (
    <div style={{ padding: 16, textAlign: "center", color: "#71717A" }}>Aucun plan disponible</div>
  );

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      {plans.map(plan => (
        <a
          key={plan.id}
          href={plan.file_url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#18181B", border: "1px solid #27272A", borderRadius: 10,
            padding: "12px 16px", textDecoration: "none",
          }}
        >
          <div style={{
            height: 40, width: 40, borderRadius: 8,
            background: "rgba(59, 130, 246, 0.1)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <FileText style={{ height: 20, width: 20, color: "#60A5FA" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {plan.plan_title || plan.plan_number}
            </div>
            <div style={{ fontSize: 11, color: "#71717A" }}>
              {plan.discipline || plan.plan_type || ""}
            </div>
          </div>
          <span style={{ color: "#52525B", fontSize: 14 }}>›</span>
        </a>
      ))}
    </div>
  );
}

// ─── Main Portal Page ───────────────────────────────────────────────
export default function PortalPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const t = useTranslations("portal");
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [userName, setUserName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("site");

  // Check if already authenticated (cookie exists)
  useEffect(() => {
    fetch(`/api/portal/${projectId}/info`)
      .then(r => {
        if (r.ok) {
          setAuthenticated(true);
          r.json().then(d => {
            if (d.userName) setUserName(d.userName);
            if (d.name) setProjectName(d.name);
            if (d.code) setProjectCode(d.code);
          });
        } else {
          // Try to get basic project info even when not authenticated
          r.json().then(d => {
            if (d.projectName) setProjectName(d.projectName);
            if (d.projectCode) setProjectCode(d.projectCode);
          }).catch(() => {});
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
        if (data.projectName) setProjectName(data.projectName);
      } else {
        setError(data.code === "RATE_LIMITED" ? t("tooManyAttempts") : t("invalidPin"));
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  // ── Loading state ──
  if (checking) {
    return (
      <div style={{
        minHeight: "100vh", background: "linear-gradient(180deg, #0F0F11, #18181B)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#F97316" }} />
      </div>
    );
  }

  // ── PIN screen ──
  if (!authenticated) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 24,
        background: "linear-gradient(180deg, #0F0F11, #18181B)",
        maxWidth: 430, margin: "0 auto",
      }}>
        {/* Logo */}
        <div style={{
          width: 48, height: 48,
          background: "linear-gradient(135deg, #F97316, #EF4444)",
          borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, color: "white", fontWeight: 800,
          fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 16,
        }}>
          C
        </div>
        <div style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800,
          color: "#FAFAFA", textAlign: "center",
        }}>
          Portail Chantier
        </div>
        {(projectName || projectCode) && (
          <div style={{ fontSize: 13, color: "#71717A", textAlign: "center", marginTop: 4, marginBottom: 24 }}>
            {projectName}{projectCode ? ` · ${projectCode}` : ""}
          </div>
        )}
        {!projectName && !projectCode && <div style={{ marginBottom: 24 }} />}

        {error && (
          <div style={{
            width: "100%", marginBottom: 12, display: "flex", alignItems: "center", gap: 8,
            borderRadius: 10, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)",
            padding: "10px 14px", fontSize: 13, color: "#F87171",
          }}>
            <AlertCircle style={{ height: 16, width: 16, flexShrink: 0 }} />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Name field */}
          <div style={{ width: "100%", marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#A1A1AA", marginBottom: 4, display: "block" }}>
              {t("yourNamePlaceholder") || "Votre nom"}
            </label>
            <input
              type="text"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              placeholder="Ex: Edgar Cardoso"
              style={{
                width: "100%", background: "#27272A", border: "1px solid #3F3F46",
                borderRadius: 10, padding: "12px 16px", fontSize: 14, color: "#FAFAFA",
                outline: "none", fontFamily: "'Inter', sans-serif",
              }}
            />
          </div>

          {/* PIN field */}
          <div style={{ width: "100%", marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#A1A1AA", marginBottom: 4, display: "block" }}>
              Code PIN
            </label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="• • • • • •"
              style={{
                width: "100%", background: "#27272A", border: "1px solid #3F3F46",
                borderRadius: 10, padding: "12px 16px", fontSize: 15, color: "#FAFAFA",
                textAlign: "center", letterSpacing: 8, fontWeight: 700,
                fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none",
              }}
            />
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={pin.length !== 6 || !userName.trim() || loading}
            style={{
              width: "100%", padding: 14, borderRadius: 10,
              background: pin.length === 6 && userName.trim() && !loading
                ? "linear-gradient(135deg, #F97316, #EA580C)"
                : "#3F3F46",
              color: "white", fontSize: 15, fontWeight: 600, border: "none",
              cursor: pin.length === 6 && userName.trim() && !loading ? "pointer" : "not-allowed",
              fontFamily: "'Plus Jakarta Sans', sans-serif", marginTop: 8,
              opacity: pin.length === 6 && userName.trim() && !loading ? 1 : 0.5,
            }}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" style={{ margin: "0 auto", display: "block" }} />
            ) : (
              t("access") || "Accéder au chantier"
            )}
          </button>
        </form>

        <div style={{ fontSize: 11, color: "#52525B", textAlign: "center", marginTop: 12 }}>
          Code fourni par votre conducteur de travaux
        </div>
      </div>
    );
  }

  // ── Authenticated app shell ──
  const tabs = [
    { id: "site", icon: "🏗️", label: t("tabSite") || "Chantier" },
    { id: "submission", icon: "📋", label: t("tabSubmission") || "Soumission" },
    { id: "plans", icon: "📐", label: t("tabPlans") || "Plans" },
    { id: "report", icon: "📝", label: t("tabReport") || "Rapport" },
  ];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: "#0C0C0E", color: "#E4E4E7", maxWidth: 430, margin: "0 auto",
      position: "relative",
    }}>
      {/* App header */}
      <div style={{
        background: "#09090B", padding: "12px 16px", display: "flex",
        alignItems: "center", gap: 10, borderBottom: "1px solid #27272A",
      }}>
        <div style={{
          width: 28, height: 28,
          background: "linear-gradient(135deg, #F97316, #EF4444)",
          borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "white", fontWeight: 800,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          C
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14,
            fontWeight: 700, color: "#FAFAFA",
          }}>
            {projectName || "Chantier"}
          </div>
          <div style={{ fontSize: 11, color: "#71717A" }}>
            {userName || ""}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 68 }}>
        {activeTab === "site" && <SiteTab projectId={projectId} />}
        {activeTab === "submission" && <SubmissionTab projectId={projectId} />}
        {activeTab === "plans" && <PlansTab projectId={projectId} />}
        {activeTab === "report" && <ReportForm projectId={projectId} />}
      </div>

      {/* Bottom navigation */}
      <nav style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430,
        background: "#09090B", borderTop: "1px solid #27272A",
        display: "flex", padding: "6px 0", zIndex: 50,
      }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", gap: 2, padding: "6px 0",
                cursor: "pointer", background: "none", border: "none",
                transition: "all 0.12s",
              }}
            >
              <span style={{
                fontSize: 18,
                filter: isActive ? "drop-shadow(0 0 4px rgba(249,115,22,0.4))" : "none",
              }}>
                {tab.icon}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 500,
                color: isActive ? "#F97316" : "#52525B",
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
