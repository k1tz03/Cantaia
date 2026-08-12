"use client";

// Hub Personnel — Suivi financier privé.
// Comptes (courant, épargne, 3e pilier, investissements...), relevés de solde
// mensuels, évolution du patrimoine, allocation, et analyse IA avec pistes de
// placement (éducatives, avec disclaimer).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Wallet,
  Plus,
  Trash2,
  Loader2,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Landmark,
  Sparkles,
  AlertTriangle,
  X,
  Coins,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { HubLockGate } from "@/components/hub/HubLockGate";

interface FinanceAccount {
  id: string;
  name: string;
  account_type: string;
  institution: string | null;
  currency: string;
  latest_balance: number | null;
  latest_date: string | null;
}

interface Overview {
  accounts: FinanceAccount[];
  total: number;
  series: { month: string; total: number }[];
  allocation: { type: string; amount: number; percent: number }[];
  variations: { m1: number | null; m3: number | null; m12: number | null };
}

interface Analysis {
  content: {
    resume?: string;
    allocation_analyse?: string;
    epargne_analyse?: string;
    points_attention?: string[];
    propositions?: { titre: string; description: string; horizon: string; risque: string }[];
    disclaimer?: string;
  };
  generated_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  courant: "Compte courant",
  epargne: "Épargne",
  troisieme_pilier: "3e pilier",
  investissement: "Investissements",
  crypto: "Crypto",
  immobilier: "Immobilier",
  autre: "Autre",
};

const TYPE_COLORS: Record<string, string> = {
  courant: "#3B82F6",
  epargne: "#10B981",
  troisieme_pilier: "#F97316",
  investissement: "#8B5CF6",
  crypto: "#F59E0B",
  immobilier: "#14B8A6",
  autre: "#71717A",
};

function formatCHF(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 0,
  }).format(amount);
}

const RISK_COLORS: Record<string, string> = {
  faible: "bg-[#10B981]/15 text-[#10B981]",
  "modéré": "bg-[#F59E0B]/15 text-[#F59E0B]",
  modere: "bg-[#F59E0B]/15 text-[#F59E0B]",
  "élevé": "bg-[#EF4444]/15 text-[#EF4444]",
  eleve: "bg-[#EF4444]/15 text-[#EF4444]",
};

export default function HubFinancePage() {
  return (
    <HubLockGate>
      <HubFinanceContent />
    </HubLockGate>
  );
}

function HubFinanceContent() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);

  // Formulaire nouveau compte
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState("epargne");
  const [accInstitution, setAccInstitution] = useState("");
  const [accBalance, setAccBalance] = useState("");
  const [accError, setAccError] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  // Saisie de solde
  const [balanceInputs, setBalanceInputs] = useState<Record<string, string>>({});
  const [savingBalance, setSavingBalance] = useState<string | null>(null);

  // Analyse IA
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/hub/finance/overview");
      if (!res.ok) return;
      const data = await res.json();
      setOverview(data);
    } catch {
      // silencieux
    }
  }, []);

  const fetchAnalysis = useCallback(async () => {
    try {
      const res = await fetch("/api/hub/finance/analyze");
      if (!res.ok) return;
      const data = await res.json();
      if (data.analysis) setAnalysis(data.analysis);
    } catch {
      // silencieux
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchOverview(), fetchAnalysis()]);
      setLoading(false);
    })();
  }, [fetchOverview, fetchAnalysis]);

  async function addAccount() {
    if (!accName.trim()) {
      setAccError("Le nom du compte est requis");
      return;
    }
    setSavingAccount(true);
    setAccError(null);
    try {
      const res = await fetch("/api/hub/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: accName.trim(),
          account_type: accType,
          institution: accInstitution.trim() || undefined,
          initial_balance: accBalance.trim() ? Number(accBalance.replace(",", ".")) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAccError(data.error || "Échec de la création");
        return;
      }
      setShowAddAccount(false);
      setAccName("");
      setAccInstitution("");
      setAccBalance("");
      await fetchOverview();
    } catch {
      setAccError("Erreur réseau");
    } finally {
      setSavingAccount(false);
    }
  }

  async function deleteAccount(account: FinanceAccount) {
    if (
      !window.confirm(
        `Supprimer le compte « ${account.name} » et tout son historique de soldes ?`
      )
    )
      return;
    await fetch(`/api/hub/finance/accounts/${account.id}`, { method: "DELETE" }).catch(() => {});
    await fetchOverview();
  }

  async function saveBalance(account: FinanceAccount) {
    const raw = (balanceInputs[account.id] || "").replace(/['\s]/g, "").replace(",", ".");
    const value = Number(raw);
    if (!raw || !Number.isFinite(value)) return;
    setSavingBalance(account.id);
    try {
      await fetch("/api/hub/finance/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: account.id, balance: value }),
      });
      setBalanceInputs((prev) => ({ ...prev, [account.id]: "" }));
      await fetchOverview();
    } catch {
      // silencieux
    } finally {
      setSavingBalance(null);
    }
  }

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/hub/finance/analyze", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setAnalyzeError(data.error || "Échec de l'analyse");
        return;
      }
      setAnalysis(data.analysis);
    } catch {
      setAnalyzeError("Erreur réseau");
    } finally {
      setAnalyzing(false);
    }
  }

  function VariationBadge({ value, label }: { value: number | null; label: string }) {
    if (value === null) {
      return (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#71717A]">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold text-[#71717A]">—</p>
        </div>
      );
    }
    const positive = value >= 0;
    const Icon = positive ? TrendingUp : TrendingDown;
    return (
      <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: positive ? "#10B981" : "#EF4444" }} />
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#71717A]">{label}</p>
        </div>
        <p
          className="mt-2 font-display text-2xl font-bold"
          style={{ color: positive ? "#10B981" : "#EF4444" }}
        >
          {positive ? "+" : ""}
          {formatCHF(value)}
        </p>
      </div>
    );
  }

  const inputClass =
    "rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-[13px] text-[#FAFAFA] placeholder-[#52525B] outline-none focus:border-[#F97316]/50";

  return (
    <div className="min-h-full bg-[#0F0F11] px-5 py-6 lg:px-7">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-[12px] font-medium text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#D4D4D8] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Hub
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#10B981] to-[#059669]">
          <Wallet className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold text-[#FAFAFA]">Mes finances</h1>
          <p className="text-[12px] text-[#71717A]">
            Suivi privé de votre épargne — saisissez vos soldes régulièrement pour suivre l&apos;évolution
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddAccount(!showAddAccount);
            setAccError(null);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#EA580C] transition-colors"
        >
          {showAddAccount ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showAddAccount ? "Annuler" : "Ajouter un compte"}
        </button>
      </div>

      {/* Formulaire nouveau compte */}
      {showAddAccount && (
        <div className="mb-5 rounded-xl border border-[#F97316]/30 bg-[#18181B] p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <input
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              placeholder="Nom (ex: Épargne UBS)"
              className={inputClass}
            />
            <select value={accType} onChange={(e) => setAccType(e.target.value)} className={inputClass}>
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={accInstitution}
              onChange={(e) => setAccInstitution(e.target.value)}
              placeholder="Banque / institution (optionnel)"
              className={inputClass}
            />
            <input
              value={accBalance}
              onChange={(e) => setAccBalance(e.target.value)}
              placeholder="Solde actuel CHF (optionnel)"
              inputMode="decimal"
              className={inputClass}
            />
          </div>
          {accError && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-[12px] text-[#EF4444]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {accError}
            </div>
          )}
          <button
            onClick={addAccount}
            disabled={savingAccount}
            className="mt-3 flex items-center gap-2 rounded-lg bg-[#F97316] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#EA580C] disabled:opacity-50 transition-colors"
          >
            {savingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Créer le compte
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
          <div className="flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-[#F97316]" />
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#71717A]">
              Patrimoine total
            </p>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-[#FAFAFA]">
            {loading ? "—" : formatCHF(overview?.total ?? 0)}
          </p>
        </div>
        <VariationBadge value={overview?.variations.m1 ?? null} label="Sur 1 mois" />
        <VariationBadge value={overview?.variations.m3 ?? null} label="Sur 3 mois" />
        <VariationBadge value={overview?.variations.m12 ?? null} label="Sur 12 mois" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* ── Évolution + Allocation ── */}
        <section className="space-y-6">
          <div className="rounded-xl border border-[#27272A] bg-[#111113] p-4">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-[#FAFAFA]">
              <TrendingUp className="h-4 w-4 text-[#10B981]" />
              Évolution du patrimoine
            </h2>
            {(overview?.series.length || 0) >= 2 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={overview!.series} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="hubFinanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#27272A" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" stroke="#52525B" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="#52525B"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181B",
                        border: "1px solid #27272A",
                        borderRadius: 8,
                        color: "#FAFAFA",
                        fontSize: 12,
                      }}
                      formatter={(value: any) => [formatCHF(Number(value)), "Total"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#10B981"
                      strokeWidth={2}
                      fill="url(#hubFinanceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[#27272A] p-8 text-center text-[13px] text-[#71717A]">
                Saisissez des soldes sur au moins 2 mois pour voir l&apos;évolution de votre épargne.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#27272A] bg-[#111113] p-4">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-[#FAFAFA]">
              <Coins className="h-4 w-4 text-[#F59E0B]" />
              Où est placé votre argent
            </h2>
            {(overview?.allocation.length || 0) > 0 ? (
              <div className="space-y-2.5">
                {overview!.allocation.map((a) => (
                  <div key={a.type}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-[#D4D4D8]">{TYPE_LABELS[a.type] || a.type}</span>
                      <span className="text-[#71717A]">
                        {formatCHF(a.amount)} · {a.percent}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#27272A]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(a.percent, 100)}%`,
                          backgroundColor: TYPE_COLORS[a.type] || "#71717A",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[#27272A] p-8 text-center text-[13px] text-[#71717A]">
                Ajoutez des comptes avec un solde pour voir la répartition.
              </div>
            )}
          </div>
        </section>

        {/* ── Comptes + saisie soldes ── */}
        <section className="rounded-xl border border-[#27272A] bg-[#111113] p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-[#FAFAFA]">
            <Landmark className="h-4 w-4 text-[#3B82F6]" />
            Mes comptes
          </h2>
          <div className="space-y-2">
            {(overview?.accounts.length || 0) === 0 ? (
              <div className="rounded-lg border border-dashed border-[#27272A] p-8 text-center text-[13px] text-[#71717A]">
                Aucun compte. Ajoutez vos comptes bancaires, épargne, 3e pilier et investissements
                pour suivre votre patrimoine.
              </div>
            ) : (
              overview!.accounts.map((account) => (
                <div
                  key={account.id}
                  className="rounded-lg border border-[#27272A] bg-[#18181B] p-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: TYPE_COLORS[account.account_type] || "#71717A" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#FAFAFA]">
                        {account.name}
                      </p>
                      <p className="text-[11px] text-[#71717A]">
                        {TYPE_LABELS[account.account_type] || account.account_type}
                        {account.institution ? ` · ${account.institution}` : ""}
                        {account.latest_date
                          ? ` · dernier relevé ${new Date(account.latest_date).toLocaleDateString("fr-CH")}`
                          : ""}
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-[15px] font-bold text-[#FAFAFA]">
                      {formatCHF(account.latest_balance)}
                    </p>
                    <button
                      onClick={() => deleteAccount(account)}
                      className="shrink-0 rounded-md p-1.5 text-[#52525B] hover:bg-[#27272A] hover:text-[#EF4444] transition-colors"
                      title="Supprimer le compte"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={balanceInputs[account.id] || ""}
                      onChange={(e) =>
                        setBalanceInputs((prev) => ({ ...prev, [account.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveBalance(account);
                      }}
                      placeholder="Nouveau solde CHF..."
                      inputMode="decimal"
                      className="flex-1 rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-[12px] text-[#FAFAFA] placeholder-[#52525B] outline-none focus:border-[#10B981]/50"
                    />
                    <button
                      onClick={() => saveBalance(account)}
                      disabled={savingBalance === account.id || !(balanceInputs[account.id] || "").trim()}
                      className="rounded-lg bg-[#10B981] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#059669] disabled:opacity-40 transition-colors"
                    >
                      {savingBalance === account.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Enregistrer"
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* ── Analyse IA & propositions de placement ── */}
      <section className="mt-6 rounded-xl border border-[#27272A] bg-[#111113] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#8B5CF6]" />
          <h2 className="font-display text-sm font-bold text-[#FAFAFA]">
            Analyse IA & pistes de placement
          </h2>
          {analysis?.generated_at && (
            <span className="text-[11px] text-[#52525B]">
              Dernière analyse : {new Date(analysis.generated_at).toLocaleDateString("fr-CH")}
            </span>
          )}
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#8B5CF6] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#7C3AED] disabled:opacity-50 transition-colors"
          >
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {analyzing ? "Analyse en cours..." : "Analyser mes finances"}
          </button>
        </div>

        {analyzeError && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-[12px] text-[#EF4444]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {analyzeError}
          </div>
        )}

        {!analysis ? (
          <div className="rounded-lg border border-dashed border-[#27272A] p-8 text-center text-[13px] text-[#71717A]">
            Lancez une analyse pour obtenir une lecture de votre allocation, de votre rythme
            d&apos;épargne et des pistes de placement adaptées au contexte suisse.
          </div>
        ) : (
          <div className="space-y-4">
            {analysis.content.resume && (
              <p className="rounded-lg bg-[#8B5CF6]/10 p-3 text-[13px] leading-relaxed text-[#D4D4D8]">
                {analysis.content.resume}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {analysis.content.allocation_analyse && (
                <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#71717A]">
                    Allocation
                  </p>
                  <p className="text-[12px] leading-relaxed text-[#A1A1AA]">
                    {analysis.content.allocation_analyse}
                  </p>
                </div>
              )}
              {analysis.content.epargne_analyse && (
                <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#71717A]">
                    Rythme d&apos;épargne
                  </p>
                  <p className="text-[12px] leading-relaxed text-[#A1A1AA]">
                    {analysis.content.epargne_analyse}
                  </p>
                </div>
              )}
            </div>
            {(analysis.content.points_attention?.length || 0) > 0 && (
              <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#F59E0B]">
                  Points d&apos;attention
                </p>
                <ul className="space-y-1">
                  {analysis.content.points_attention!.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-[#D4D4D8]">
                      <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[#F59E0B]" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(analysis.content.propositions?.length || 0) > 0 && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {analysis.content.propositions!.map((prop, i) => (
                  <div key={i} className="rounded-lg border border-[#27272A] bg-[#18181B] p-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <p className="flex-1 text-[13px] font-semibold text-[#FAFAFA]">{prop.titre}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          RISK_COLORS[(prop.risque || "").toLowerCase()] || "bg-[#27272A] text-[#A1A1AA]"
                        }`}
                      >
                        {prop.risque}
                      </span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-[#A1A1AA]">{prop.description}</p>
                    <p className="mt-2 text-[11px] text-[#52525B]">Horizon : {prop.horizon}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="rounded-lg border border-[#27272A] bg-[#18181B] p-3 text-[11px] italic leading-relaxed text-[#71717A]">
              {analysis.content.disclaimer ||
                "Ces informations sont fournies à titre éducatif uniquement et ne constituent pas un conseil financier personnalisé. Consultez un conseiller financier agréé avant toute décision de placement."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
