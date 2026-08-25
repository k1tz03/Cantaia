"use client";

/**
 * One CSS mockup per SEO solution page. Same rule as the landing mockups:
 * plain HTML/CSS in the real app's visual language, no screenshots, no images.
 * Labels come from `chantier.solutionsPage.<solution>` so the German page shows
 * a German screen.
 */

import { useTranslations } from "next-intl";

function Frame({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <figure className="overflow-hidden border border-[#27272A] bg-[#18181B]">
      <div className="flex items-center gap-3 border-b border-[#27272A] bg-[#0F0F11] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3F3F46]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3F3F46]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3F3F46]" />
        </div>
        <span className="truncate font-tech text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
          {title}
        </span>
      </div>
      {children}
      <figcaption className="border-t border-[#27272A] px-4 py-2.5 font-sans text-[12px] text-[#A1A1AA]">
        {caption}
      </figcaption>
    </figure>
  );
}

// --- 1. Tenders — supplier comparison ---------------------------------------

const TENDER_VALUES = [
  { qty: "1 240", v: ["185.—", "179.—", "192.—"], best: 1 },
  { qty: "3 480", v: ["68.—", "72.—", "64.—"], best: 2 },
  { qty: "96 000", v: ["2.85", "2.70", "2.95"], best: 1 },
];

function TenderMockup() {
  const t = useTranslations("chantier.solutionsPage.soumissions");
  const rows = [t("mockupRow1"), t("mockupRow2"), t("mockupRow3")];
  // Fictional supplier names — never real companies, so a fabricated price
  // comparison can't be read as a claim about an actual firm.
  const suppliers = ["Berger SA", "Novaco SA", "Alptech SA"];

  return (
    <Frame title={t("mockupTitle")} caption={t("mockupCaption")}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse">
          <thead>
            <tr className="border-b border-[#27272A]">
              <th className="px-4 py-2.5 text-left font-tech text-[9px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                {t("mockupColItem")}
              </th>
              <th className="px-3 py-2.5 text-right font-tech text-[9px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                {t("mockupColQty")}
              </th>
              {suppliers.map((s) => (
                <th
                  key={s}
                  className="px-3 py-2.5 text-right font-tech text-[9px] uppercase tracking-[0.16em] text-[#A1A1AA]"
                >
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((label, i) => (
              <tr key={label} className="border-b border-[#27272A]/70">
                <td className="px-4 py-2.5 font-sans text-[12.5px] text-[#D4D4D8]">{label}</td>
                <td className="px-3 py-2.5 text-right font-tech text-[11px] tabular-nums text-[#A1A1AA]">
                  {TENDER_VALUES[i].qty}
                </td>
                {TENDER_VALUES[i].v.map((val, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2.5 text-right font-tech text-[11.5px] tabular-nums ${
                      TENDER_VALUES[i].best === j ? "text-[#F97316]" : "text-[#A1A1AA]"
                    }`}
                  >
                    {val}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td
                colSpan={2}
                className="px-4 py-3 font-tech text-[10px] uppercase tracking-[0.16em] text-[#A1A1AA]"
              >
                {t("mockupTotal")}
              </td>
              <td className="px-3 py-3 text-right font-condensed text-[15px] font-800 tabular-nums text-[#A1A1AA]">
                284 500
              </td>
              <td className="px-3 py-3 text-right font-condensed text-[15px] font-900 tabular-nums text-[#F97316]">
                271 900
              </td>
              <td className="px-3 py-3 text-right font-condensed text-[15px] font-800 tabular-nums text-[#A1A1AA]">
                296 200
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="border-t border-[#27272A] px-4 py-2">
        <span className="inline-flex border border-[#F97316]/60 bg-[#F97316]/10 px-1.5 py-[1px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#F97316]">
          {t("mockupBest")}
        </span>
      </div>
    </Frame>
  );
}

// --- 2. Minutes -------------------------------------------------------------

function MinutesMockup() {
  const t = useTranslations("chantier.solutionsPage.pv");

  return (
    <Frame title={t("mockupTitle")} caption={t("mockupCaption")}>
      <div className="space-y-4 px-5 py-5">
        <div className="border-l-2 border-[#22C55E] bg-[#0F0F11] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-condensed text-[15px] font-800 uppercase tracking-[0.02em] text-[#FAFAFA]">
              {t("mockupSection1")}
            </h4>
            <span className="shrink-0 border border-[#22C55E]/50 bg-[#22C55E]/10 px-1.5 py-[1px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#4ADE80]">
              {t("mockupDecision")}
            </span>
          </div>
          <p className="mt-2 font-sans text-[12.5px] leading-relaxed text-[#A1A1AA]">
            {t("mockupSection1Body")}
          </p>
        </div>

        <div className="border-l-2 border-[#F97316] bg-[#0F0F11] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-condensed text-[15px] font-800 uppercase tracking-[0.02em] text-[#FAFAFA]">
              {t("mockupSection2")}
            </h4>
            <span className="shrink-0 border border-[#F97316]/60 bg-[#F97316]/10 px-1.5 py-[1px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#F97316]">
              {t("mockupOpen")}
            </span>
          </div>
          <p className="mt-2 font-sans text-[12.5px] leading-relaxed text-[#A1A1AA]">
            {t("mockupSection2Body")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="border border-[#27272A] px-2 py-[2px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#A1A1AA]">
              {t("mockupOwner")}
            </span>
            <span className="border border-[#27272A] px-2 py-[2px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#A1A1AA]">
              {t("mockupDue")}
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// --- 3. Schedule ------------------------------------------------------------

const SCHEDULE_BARS = [
  { phase: 0, offset: 0, width: 24 },
  { phase: 0, offset: 20, width: 30 },
  { phase: 0, offset: 44, width: 28 },
  { phase: 1, offset: 68, width: 22 },
];

function ScheduleMockup() {
  const t = useTranslations("chantier.solutionsPage.planning");
  const tasks = [t("mockupTask1"), t("mockupTask2"), t("mockupTask3"), t("mockupTask4")];

  return (
    <Frame title={t("mockupTitle")} caption={t("mockupCaption")}>
      <div className="px-5 py-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="border border-[#F97316]/60 bg-[#F97316]/10 px-2 py-[2px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#F97316]">
            {t("mockupPhase1")}
          </span>
          <span className="border border-[#27272A] px-2 py-[2px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#A1A1AA]">
            {t("mockupPhase2")}
          </span>
          <span className="ml-auto font-tech text-[9px] uppercase tracking-[0.16em] text-[#52525B]">
            {t("mockupWeeks")}
          </span>
        </div>

        <div className="space-y-3">
          {tasks.map((name, i) => (
            <div key={name} className="grid grid-cols-[96px_1fr] items-center gap-3">
              <span className="truncate font-sans text-[11.5px] text-[#A1A1AA]">{name}</span>
              <div className="relative h-[14px] border-b border-dashed border-[#27272A]/80">
                <span
                  className={`absolute inset-y-[2px] ${
                    SCHEDULE_BARS[i].phase === 0 ? "bg-[#F97316]" : "bg-[#3F3F46]"
                  }`}
                  style={{ left: `${SCHEDULE_BARS[i].offset}%`, width: `${SCHEDULE_BARS[i].width}%` }}
                />
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[96px_1fr] items-center gap-3">
            <span className="truncate font-sans text-[11.5px] text-[#A1A1AA]">{t("mockupTask5")}</span>
            <div className="relative h-[14px]">
              <span className="absolute top-1/2 block h-[10px] w-[10px] -translate-y-1/2 rotate-45 border border-[#F97316] bg-[#0F0F11]" style={{ left: "90%" }} />
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-[#27272A] pt-3">
          <span className="inline-flex border border-[#F97316]/60 bg-[#F97316]/10 px-1.5 py-[1px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#F97316]">
            {t("mockupMilestone")}
          </span>
        </div>
      </div>
    </Frame>
  );
}

// --- 4. Daily reports -------------------------------------------------------

const HOURS = [42.5, 38, 40.5];

function ReportsMockup() {
  const t = useTranslations("chantier.solutionsPage.rapports");
  const workers = [t("mockupWorker1"), t("mockupWorker2"), t("mockupWorker3")];

  return (
    <Frame title={t("mockupTitle")} caption={t("mockupCaption")}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] border-collapse">
          <thead>
            <tr className="border-b border-[#27272A]">
              <th className="px-4 py-2.5 text-left font-tech text-[9px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                {t("mockupColWorker")}
              </th>
              <th className="px-4 py-2.5 text-left font-tech text-[9px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                {t("mockupColProject")}
              </th>
              <th className="px-4 py-2.5 text-right font-tech text-[9px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                {t("mockupColHours")}
              </th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w, i) => (
              <tr key={w} className="border-b border-[#27272A]/70">
                <td className="px-4 py-2.5 font-sans text-[12.5px] text-[#D4D4D8]">{w}</td>
                <td className="px-4 py-2.5 font-sans text-[12.5px] text-[#A1A1AA]">
                  {t("mockupProject")}
                </td>
                <td className="px-4 py-2.5 text-right font-tech text-[12px] tabular-nums text-[#FAFAFA]">
                  {HOURS[i].toFixed(1)}
                </td>
              </tr>
            ))}
            <tr>
              <td
                colSpan={2}
                className="px-4 py-3 font-tech text-[10px] uppercase tracking-[0.16em] text-[#A1A1AA]"
              >
                {t("mockupTotal")}
              </td>
              <td className="px-4 py-3 text-right font-condensed text-[18px] font-900 tabular-nums text-[#F97316]">
                121.0
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 border-t border-[#27272A] px-4 py-2.5">
        <span className="flex h-6 w-8 items-center justify-center border border-[#27272A] bg-[#0F0F11] font-tech text-[8px] text-[#52525B]">
          JPG
        </span>
        <span className="font-tech text-[9px] uppercase tracking-[0.14em] text-[#A1A1AA]">
          {t("mockupNote")} · BL-2481
        </span>
      </div>
    </Frame>
  );
}

// --- Router -----------------------------------------------------------------

export type SolutionKey = "soumissions" | "pv" | "planning" | "rapports";

export function SolutionMockup({ solution }: { solution: SolutionKey }) {
  switch (solution) {
    case "soumissions":
      return <TenderMockup />;
    case "pv":
      return <MinutesMockup />;
    case "planning":
      return <ScheduleMockup />;
    case "rapports":
      return <ReportsMockup />;
  }
}
