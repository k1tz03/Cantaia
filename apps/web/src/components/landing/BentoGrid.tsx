"use client";

import { useTranslations } from "next-intl";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import {
  Mail,
  FileText,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Sun,
  Mic,
  ClipboardList,
  Layers,
} from "lucide-react";

// ── Shared ───────────────────────────────────────────────────

const cellBase =
  "bento-cell relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm transition-all duration-300 will-change-[transform,opacity] hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08] h-full";

function CellHeader({
  icon: Icon,
  title,
  color,
  accent,
}: {
  icon: React.ElementType;
  title: string;
  color: string;
  accent: string;
}) {
  return (
    <>
      <div
        className="absolute left-4 right-4 top-0 h-[2px] rounded-b-full opacity-50"
        style={{ backgroundColor: accent }}
      />
      <div className="mb-3 flex items-center gap-2">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-lg ${color}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs font-semibold text-white/70">{title}</span>
      </div>
    </>
  );
}

// ── Cell 1: Email Triage ──────────────────────────────────────

function EmailCell({ active }: { active: boolean }) {
  const t = useTranslations("landing.bento");
  const [idx, setIdx] = useState(0);

  const emails = [
    {
      sender: "Pierre Favre",
      subj: t("email1Subj"),
      project: t("email1Project"),
      pct: 94,
    },
    {
      sender: "Implenia SA",
      subj: t("email2Subj"),
      project: t("email2Project"),
      pct: 91,
    },
    {
      sender: "Hilti AG",
      subj: t("email3Subj"),
      project: null,
      pct: 0,
    },
    {
      sender: "Marc Dupont",
      subj: t("email4Subj"),
      project: t("email4Project"),
      pct: 87,
    },
    {
      sender: "CSD Ingénieurs",
      subj: t("email5Subj"),
      project: t("email5Project"),
      pct: 96,
    },
  ];

  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => setIdx((i) => (i + 1) % emails.length), 3000);
    return () => clearInterval(iv);
  }, [active, emails.length]);

  const visible = [0, 1, 2].map((o) => emails[(idx + o) % emails.length]);

  return (
    <div className={cellBase}>
      <CellHeader
        icon={Mail}
        title={t("emailTitle")}
        color="bg-blue-500/20 text-blue-400"
        accent="#3B82F6"
      />
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {visible.map((em, i) => (
            <motion.div
              key={`${idx}-${i}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
              className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-white/60">
                    {em.sender} — {em.subj}
                  </p>
                </div>
                {em.project ? (
                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">
                    {em.pct}%
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-400">
                    Spam
                  </span>
                )}
              </div>
              {em.project ? (
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-[10px] text-white/40">
                    → {em.project}
                  </span>
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400/60" />
                </div>
              ) : (
                <p className="mt-0.5 text-[10px] text-red-400/50">
                  {t("emailAutoIgnored")}
                </p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Cell 2: PV Automatique ────────────────────────────────────

function PVCell({ active }: { active: boolean }) {
  const t = useTranslations("landing.bento");
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) return;
    const cycle = [2000, 2000, 2000, 2000, 3000];
    const timeout = setTimeout(() => {
      setStep((s) => (s >= 4 ? 0 : s + 1));
    }, cycle[step] || 2000);
    return () => clearTimeout(timeout);
  }, [active, step]);

  const progress = step === 0 ? 0 : step === 1 ? 45 : 100;

  const steps = [
    { label: t("pvTranscribed"), done: step >= 2 },
    { label: t("pvGenerated"), done: step >= 3 },
    { label: `${t("pvSent")} (${t("pvDest")})`, done: step >= 4 },
  ];

  return (
    <div className={cellBase}>
      <CellHeader
        icon={FileText}
        title={t("pvTitle")}
        color="bg-emerald-500/20 text-emerald-400"
        accent="#10B981"
      />
      <div className="mb-3 flex items-center gap-2">
        <Mic className="h-3.5 w-3.5 text-emerald-400/60" />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-emerald-400/60"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-white/30">45:12</span>
      </div>
      <div className="space-y-1.5">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div
              className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors duration-500 ${
                s.done
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-white/5 text-white/20"
              }`}
            >
              <CheckCircle2 className="h-3 w-3" />
            </div>
            <span
              className={`text-[10px] transition-colors duration-500 ${
                s.done ? "text-white/60" : "text-white/25"
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>
      {step >= 4 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 text-center text-[10px] font-semibold text-emerald-400/70"
        >
          ⏱️ {t("pvTime")}
        </motion.p>
      )}
    </div>
  );
}

// ── Cell 3: Tâches Kanban (with drag animation) ───────────────

function TasksCell({ active }: { active: boolean }) {
  const t = useTranslations("landing.bento");
  const [phase, setPhase] = useState(0);
  // 0: rest (3s), 1: card moving (1.5s), 2: counts updated (3.5s)

  useEffect(() => {
    if (!active) return;
    const delays = [3000, 1500, 3500];
    const timeout = setTimeout(
      () => setPhase((p) => (p + 1) % 3),
      delays[phase]
    );
    return () => clearTimeout(timeout);
  }, [active, phase]);

  const counts = phase >= 2 ? [2, 6, 12] : [3, 5, 12];

  const cols = [
    {
      label: t("tasksTodo"),
      count: counts[0],
      color: "border-violet-400/30 bg-violet-400/5 text-violet-300",
    },
    {
      label: t("tasksProgress"),
      count: counts[1],
      color: "border-amber-400/30 bg-amber-400/5 text-amber-300",
    },
    {
      label: t("tasksDone"),
      count: counts[2],
      color: "border-emerald-400/30 bg-emerald-400/5 text-emerald-300",
    },
  ];

  return (
    <div className={cellBase}>
      <CellHeader
        icon={ClipboardList}
        title={t("tasksTitle")}
        color="bg-violet-500/20 text-violet-400"
        accent="#8B5CF6"
      />
      <div className="relative grid grid-cols-3 gap-2">
        {cols.map((col) => (
          <div key={col.label} className="text-center">
            <p className="mb-1.5 text-[9px] font-medium text-white/40">
              {col.label}
            </p>
            <div className={`rounded-lg border px-2 py-3 ${col.color}`}>
              <span className="text-lg font-bold">{col.count}</span>
            </div>
          </div>
        ))}
        {/* Floating drag card */}
        <AnimatePresence>
          {phase === 1 && (
            <motion.div
              className="pointer-events-none absolute z-10 flex h-7 w-10 items-center justify-center rounded-md border border-violet-400/50 bg-violet-500/20 text-[9px] font-bold text-violet-300 shadow-lg shadow-violet-500/10"
              style={{ top: "55%" }}
              initial={{ left: "10%", opacity: 0, scale: 0.8 }}
              animate={{ left: "42%", opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
            >
              1
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Cell 4: Intelligence Tarifaire ────────────────────────────

function PriceCell({ active }: { active: boolean }) {
  const t = useTranslations("landing.bento");
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 1000);
    }, 2500);
    return () => clearInterval(iv);
  }, [active]);

  return (
    <div className={cellBase}>
      <CellHeader
        icon={AlertTriangle}
        title={t("priceTitle")}
        color="bg-amber-500/20 text-amber-400"
        accent="#F59E0B"
      />
      <p className="text-[11px] font-semibold text-white/60">
        {t("priceItem")}
      </p>
      <p
        className={`mt-1 text-lg font-bold transition-all duration-500 ${
          pulse ? "scale-110 text-red-400" : "scale-100 text-amber-400"
        }`}
      >
        {t("priceChange")}
      </p>
      <div className="mt-2 space-y-1 text-[10px]">
        <div className="flex justify-between text-white/40">
          <span>HRS</span>
          <span>195 CHF/m³</span>
        </div>
        <div className="flex justify-between text-white/40">
          <span>Cèdres</span>
          <span>178 CHF/m³</span>
        </div>
      </div>
      <div className="mt-2 rounded-md bg-red-500/10 px-2 py-1">
        <p className="text-[10px] font-semibold text-red-400/80">
          {t("priceImpact")}
        </p>
      </div>
    </div>
  );
}

// ── Cell 5: Comparatif Offres (with green flash) ──────────────

function ComparisonCell({ active }: { active: boolean }) {
  const t = useTranslations("landing.bento");
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, amount: 0.3 });
  const [showRows, setShowRows] = useState(true);

  // Cycle: rows visible for 6s, hidden for 2s, repeat
  useEffect(() => {
    if (!active) return;
    const delay = showRows ? 6000 : 2000;
    const timeout = setTimeout(() => setShowRows((s) => !s), delay);
    return () => clearTimeout(timeout);
  }, [active, showRows]);

  const suppliers = ["Holcim", "Implenia", "Losinger"];
  const rows = [
    {
      label: t("compExcavation"),
      values: [45.0, 52.0, 48.5],
      best: 0,
    },
    {
      label: t("compConcrete"),
      values: [null, 185.0, 178.0],
      best: 2,
    },
    {
      label: t("compFormwork"),
      values: [62.0, 58.5, 65.0],
      best: 1,
    },
  ];
  const totals = ["125'430", "118'920", "131'200"];
  const bestTotal = 1;

  const shouldAnimate = isInView && active && showRows;

  return (
    <div ref={ref} className={cellBase}>
      <CellHeader
        icon={BarChart3}
        title={t("compTitle")}
        color="bg-cyan-500/20 text-cyan-400"
        accent="#06B6D4"
      />
      <p className="mb-2 text-[9px] font-medium text-white/30">
        {t("compSubtitle")}
      </p>

      {/* Header row */}
      <div className="mb-1 grid grid-cols-4 gap-1 text-[8px] font-semibold text-white/40">
        <div />
        {suppliers.map((s) => (
          <div key={s} className="text-center">
            {s}
          </div>
        ))}
      </div>

      {/* Data rows */}
      <div className="space-y-1">
        <AnimatePresence mode="wait">
          {showRows &&
            rows.map((row, rowIdx) => (
              <motion.div
                key={`${row.label}-${showRows}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.3, delay: rowIdx * 0.2 }}
                className="grid grid-cols-4 gap-1 text-[9px]"
              >
                <div className="truncate text-white/40">{row.label}</div>
                {row.values.map((v, vi) => (
                  <motion.div
                    key={vi}
                    animate={
                      vi === row.best && shouldAnimate
                        ? {
                            backgroundColor: [
                              "rgba(16,185,129,0)",
                              "rgba(16,185,129,0.2)",
                              "rgba(16,185,129,0)",
                            ],
                          }
                        : {}
                    }
                    transition={{
                      duration: 0.8,
                      delay: 0.4 + rowIdx * 0.3,
                    }}
                    className={`rounded px-0.5 text-center tabular-nums ${
                      vi === row.best
                        ? "font-semibold text-emerald-400"
                        : "text-white/40"
                    }`}
                  >
                    {v !== null ? v.toFixed(2) : "—"}
                    {vi === row.best && " ✓"}
                  </motion.div>
                ))}
              </motion.div>
            ))}
        </AnimatePresence>
      </div>

      {/* Total row */}
      <AnimatePresence>
        {showRows && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.8 }}
            className="mt-2 grid grid-cols-4 gap-1 border-t border-white/10 pt-1.5 text-[9px] font-bold"
          >
            <div className="text-white/50">{t("compTotal")}</div>
            {totals.map((val, vi) => (
              <motion.div
                key={vi}
                animate={
                  vi === bestTotal && shouldAnimate
                    ? {
                        backgroundColor: [
                          "rgba(16,185,129,0)",
                          "rgba(16,185,129,0.2)",
                          "rgba(16,185,129,0)",
                        ],
                      }
                    : {}
                }
                transition={{ duration: 0.8, delay: 1.2 }}
                className={`rounded px-0.5 text-center tabular-nums ${
                  vi === bestTotal ? "text-emerald-400" : "text-white/50"
                }`}
              >
                {val}
                {vi === bestTotal && " ✓"}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Cell 6: Briefing Quotidien ────────────────────────────────

function BriefingCell({ active }: { active: boolean }) {
  const t = useTranslations("landing.bento");
  const fullText = t("briefingText");
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (charCount > fullText.length) {
      const timeout = setTimeout(() => setCharCount(0), 4000);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => setCharCount((c) => c + 1), 35);
    return () => clearTimeout(timeout);
  }, [active, charCount, fullText.length]);

  const displayText = fullText.slice(0, charCount);
  const showPriority = charCount >= fullText.length;

  return (
    <div className={cellBase}>
      <CellHeader
        icon={Sun}
        title={t("briefingTitle")}
        color="bg-amber-500/20 text-amber-400"
        accent="#F59E0B"
      />
      <div className="min-h-[60px] rounded-lg bg-white/[0.03] p-3">
        <p className="text-[11px] leading-relaxed text-white/50">
          &ldquo;{displayText}
          <span className="animate-pulse text-amber-400">|</span>&rdquo;
        </p>
      </div>
      {showPriority && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-1.5"
        >
          <span className="text-[9px] font-semibold text-amber-400/70">
            {t("briefingPriority")}
          </span>
          <span className="text-[10px] text-white/50">
            📋 {t("briefingTask")}
          </span>
        </motion.div>
      )}
    </div>
  );
}

// ── Cell 7: Plan Registry ─────────────────────────────────────

function PlansCell({ active }: { active: boolean }) {
  const t = useTranslations("landing.bento");
  const [visibleCount, setVisibleCount] = useState(0);

  const plans = [
    { name: t("plan1Name"), rev: t("plan1Rev"), status: "validated" as const },
    { name: t("plan2Name"), rev: t("plan2Rev"), status: "review" as const },
    { name: t("plan3Name"), rev: t("plan3Rev"), status: "pending" as const },
  ];

  const statusConfig = {
    validated: {
      icon: "✅",
      label: t("planValidated"),
      color: "text-emerald-400",
    },
    review: {
      icon: "🔄",
      label: t("planReview"),
      color: "text-amber-400",
    },
    pending: {
      icon: "⏳",
      label: t("planPending"),
      color: "text-white/40",
    },
  };

  useEffect(() => {
    if (!active) return;
    if (visibleCount <= plans.length) {
      const timeout = setTimeout(
        () => setVisibleCount((c) => c + 1),
        800
      );
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => setVisibleCount(0), 5000);
    return () => clearTimeout(timeout);
  }, [active, visibleCount, plans.length]);

  return (
    <div className={cellBase}>
      <CellHeader
        icon={Layers}
        title={t("plansTitle")}
        color="bg-indigo-500/20 text-indigo-400"
        accent="#6366F1"
      />
      <div className="space-y-2">
        {plans.map((plan, i) => {
          const cfg = statusConfig[plan.status];
          return (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, x: -8 }}
              animate={
                i < visibleCount
                  ? { opacity: 1, x: 0 }
                  : { opacity: 0, x: -8 }
              }
              transition={{ duration: 0.3 }}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-1.5"
            >
              <div>
                <p className="text-[11px] font-medium text-white/60">
                  {plan.name}
                </p>
                <p className="text-[9px] text-white/30">{plan.rev}</p>
              </div>
              <span className={`text-[9px] font-semibold ${cfg.color}`}>
                {cfg.icon} {cfg.label}
              </span>
            </motion.div>
          );
        })}
      </div>
      {visibleCount > plans.length && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 text-center text-[9px] text-white/30"
        >
          {t("plansCount")}
        </motion.p>
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

export function BentoGrid() {
  const gridRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(gridRef, { once: false, amount: 0.15 });

  return (
    <>
      {/* Hover dimming: when any cell is hovered, dim the others */}
      <style
        dangerouslySetInnerHTML={{
          __html: `.bento-grid:has(.bento-cell:hover) .bento-cell:not(:hover){opacity:.7}`,
        }}
      />
      <motion.div
        ref={gridRef}
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.15 } },
        }}
        className="bento-grid grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
      >
        {/* Row 1: Email (span 2) + PV (1) */}
        <motion.div
          variants={itemVariants}
          className="md:col-span-2 lg:col-span-2"
        >
          <EmailCell active={isInView} />
        </motion.div>

        <motion.div variants={itemVariants} className="hidden md:block">
          <PVCell active={isInView} />
        </motion.div>

        {/* Row 2: Tasks (1) + Price (1) + Comparison (1) */}
        <motion.div variants={itemVariants} className="hidden lg:block">
          <TasksCell active={isInView} />
        </motion.div>

        <motion.div variants={itemVariants} className="hidden lg:block">
          <PriceCell active={isInView} />
        </motion.div>

        <motion.div variants={itemVariants}>
          <ComparisonCell active={isInView} />
        </motion.div>

        {/* Row 3: Briefing (span 2) + Plans (1) */}
        <motion.div variants={itemVariants} className="md:col-span-2">
          <BriefingCell active={isInView} />
        </motion.div>

        <motion.div variants={itemVariants} className="hidden lg:block">
          <PlansCell active={isInView} />
        </motion.div>
      </motion.div>
    </>
  );
}
