"use client";

/**
 * Product mockups for the marketing landing page.
 *
 * Everything here is plain HTML/CSS — no screenshots, no images, no canvas.
 * The visual language mirrors the real app (dark zinc surfaces, #F97316
 * accent, IBM Plex Mono "tech" labels) so what the visitor sees on the
 * landing page matches what they get after signing up.
 *
 * Animations are pure CSS keyframes injected once via <MockupStyles />.
 * They all collapse to a static end-state under prefers-reduced-motion.
 */

import { useTranslations } from "next-intl";

// ---------------------------------------------------------------------------
// Shared CSS (injected once per page that uses a mockup)
// ---------------------------------------------------------------------------

const MOCKUP_CSS = `
@keyframes cnt-classify-pending {
  0%, 22%   { opacity: 1; }
  32%, 100% { opacity: 0; }
}
@keyframes cnt-classify-done {
  0%, 30%   { opacity: 0; transform: translateY(4px) scale(.96); }
  42%, 92%  { opacity: 1; transform: translateY(0) scale(1); }
  100%      { opacity: 0; transform: translateY(4px) scale(.96); }
}
@keyframes cnt-scan {
  0%   { transform: translateX(-100%); }
  55%  { transform: translateX(100%); }
  100% { transform: translateX(100%); }
}
@keyframes cnt-row-in {
  0%, 8%    { opacity: 0; transform: translateY(6px); }
  20%, 100% { opacity: 1; transform: translateY(0); }
}
@keyframes cnt-bar-grow {
  0%, 6%    { transform: scaleX(0); }
  55%, 100% { transform: scaleX(1); }
}
@keyframes cnt-best-pulse {
  0%, 40%   { box-shadow: 0 0 0 0 rgba(249,115,22,0); border-color: #27272A; }
  60%, 92%  { box-shadow: 0 0 0 1px #F97316 inset; border-color: #F97316; }
  100%      { box-shadow: 0 0 0 0 rgba(249,115,22,0); border-color: #27272A; }
}
@keyframes cnt-caret {
  0%, 49%  { opacity: 1; }
  50%, 100%{ opacity: 0; }
}
.cnt-anim { animation-duration: 7s; animation-iteration-count: infinite; animation-timing-function: cubic-bezier(.2,.8,.2,1); }
@media (prefers-reduced-motion: reduce) {
  .cnt-anim { animation: none !important; opacity: 1 !important; transform: none !important; }
}
`;

export function MockupStyles() {
  return <style dangerouslySetInnerHTML={{ __html: MOCKUP_CSS }} />;
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function WindowChrome({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#27272A] bg-[#0F0F11] px-4 py-2.5">
      <div className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#3F3F46]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#3F3F46]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#3F3F46]" />
      </div>
      <span className="font-tech text-[10px] uppercase tracking-[0.2em] text-[#A1A1AA]">
        {title}
      </span>
    </div>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "urgent" | "accent" | "info";
}) {
  const tones = {
    neutral: "border-[#3F3F46] text-[#A1A1AA]",
    urgent: "border-[#EF4444]/60 bg-[#EF4444]/10 text-[#F87171]",
    accent: "border-[#F97316]/60 bg-[#F97316]/10 text-[#F97316]",
    info: "border-[#3B82F6]/50 bg-[#3B82F6]/10 text-[#60A5FA]",
  };
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-[1px] font-tech text-[9px] uppercase tracking-[0.14em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 1. Hero mockup — Mail "decisions" view (two panes, like the real module)
// ---------------------------------------------------------------------------

export function MailDecisionsMockup() {
  const t = useTranslations("chantier.landingPage.mockup");

  const mails = [
    {
      sender: t("mail1Sender"),
      subject: t("mail1Subject"),
      project: t("mail1Project"),
      badge: t("mail1Badge"),
      tone: "urgent" as const,
      time: t("mail1Time"),
      active: true,
    },
    {
      sender: t("mail2Sender"),
      subject: t("mail2Subject"),
      project: t("mail2Project"),
      badge: t("mail2Badge"),
      tone: "accent" as const,
      time: t("mail2Time"),
      active: false,
    },
    {
      sender: t("mail3Sender"),
      subject: t("mail3Subject"),
      project: t("mail3Project"),
      badge: t("mail3Badge"),
      tone: "info" as const,
      time: t("mail3Time"),
      active: false,
    },
  ];

  return (
    <figure
      className="w-full overflow-hidden border border-[#27272A] bg-[#18181B] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)]"
      role="img"
      aria-label={t("ariaLabel")}
    >
      <WindowChrome title={t("windowTitle")} />

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,44%)_minmax(0,56%)]">
        {/* -- List pane -- */}
        <div className="border-b border-[#27272A] md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b border-[#27272A] px-4 py-3">
            <span className="font-condensed text-[15px] font-800 uppercase tracking-[0.14em] text-[#FAFAFA]">
              {t("paneTitle")}
            </span>
            <span className="font-tech text-[10px] tracking-[0.14em] text-[#A1A1AA]">
              {t("paneCount")}
            </span>
          </div>

          <div className="flex gap-1.5 border-b border-[#27272A] px-4 py-2.5">
            <span className="border border-[#F97316] bg-[#F97316]/10 px-2 py-[3px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#F97316]">
              {t("filterUrgent")}
            </span>
            <span className="border border-[#27272A] px-2 py-[3px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#A1A1AA]">
              {t("filterWeek")}
            </span>
            <span className="border border-[#27272A] px-2 py-[3px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#A1A1AA]">
              {t("filterInfo")}
            </span>
          </div>

          <ul className="divide-y divide-[#27272A]">
            {mails.map((m) => (
              <li
                key={m.subject}
                className={`px-4 py-3.5 ${
                  m.active ? "border-l-2 border-[#F97316] bg-[#1C1C1F]" : "border-l-2 border-transparent"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-sans text-[12px] font-600 text-[#FAFAFA]">
                    {m.sender}
                  </span>
                  <span className="shrink-0 font-tech text-[10px] text-[#52525B]">{m.time}</span>
                </div>
                <p className="mt-1 truncate font-sans text-[12px] leading-snug text-[#A1A1AA]">
                  {m.subject}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">{m.project}</Badge>
                  <Badge tone={m.tone}>{m.badge}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* -- Detail pane -- */}
        <div className="flex flex-col bg-[#0F0F11]">
          <div className="border-b border-[#27272A] px-5 py-4">
            <p className="font-sans text-[11px] text-[#A1A1AA]">{t("detailFrom")}</p>
            <h3 className="mt-1 font-condensed text-[19px] font-800 uppercase leading-tight tracking-[0.01em] text-[#FAFAFA]">
              {t("detailSubject")}
            </h3>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="border-l-2 border-[#F97316] bg-[#18181B] px-4 py-3">
              <div className="font-tech text-[9px] uppercase tracking-[0.2em] text-[#F97316]">
                {t("detailSummaryLabel")}
              </div>
              <p className="mt-1.5 font-sans text-[12.5px] leading-relaxed text-[#D4D4D8]">
                {t("detailSummary")}
              </p>
            </div>

            <div className="border border-dashed border-[#3F3F46] bg-[#18181B] px-4 py-3">
              <div className="font-tech text-[9px] uppercase tracking-[0.2em] text-[#A1A1AA]">
                {t("detailReplyLabel")}
              </div>
              <p className="mt-1.5 font-sans text-[12.5px] leading-relaxed text-[#A1A1AA]">
                {t("detailReplyBody")}
                <span className="cnt-anim ml-0.5 inline-block h-[13px] w-[6px] translate-y-[2px] bg-[#F97316]" style={{ animationName: "cnt-caret", animationDuration: "1.1s", animationTimingFunction: "steps(1)" }} />
              </p>
            </div>
          </div>

          <div className="mt-auto flex flex-wrap gap-2 border-t border-[#27272A] px-5 py-3.5">
            <span className="border border-[#F97316] bg-[#F97316] px-3 py-1.5 font-condensed text-[11px] font-800 uppercase tracking-[0.18em] text-[#0A0A0C]">
              {t("actionReply")}
            </span>
            <span className="border border-[#27272A] px-3 py-1.5 font-condensed text-[11px] font-700 uppercase tracking-[0.18em] text-[#A1A1AA]">
              {t("actionTask")}
            </span>
            <span className="border border-[#27272A] px-3 py-1.5 font-condensed text-[11px] font-700 uppercase tracking-[0.18em] text-[#A1A1AA]">
              {t("actionArchive")}
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 2. "Product in action" — email being classified
// ---------------------------------------------------------------------------

export function ClassifyMockup() {
  const t = useTranslations("chantier.landingPage.action");

  return (
    <div className="relative overflow-hidden border border-[#27272A] bg-[#18181B]">
      <WindowChrome title={t("m1Inbox")} />
      <div className="relative px-4 py-5">
        {/* scan sweep */}
        <div
          aria-hidden
          className="cnt-anim pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[#F97316]/10 to-transparent"
          style={{ animationName: "cnt-scan" }}
        />
        <div className="relative border border-[#27272A] bg-[#0F0F11] px-4 py-3.5">
          <div className="font-sans text-[12px] font-600 text-[#FAFAFA]">{t("m1Sender")}</div>
          <p className="mt-1 font-sans text-[12px] text-[#A1A1AA]">{t("m1Subject")}</p>

          <div className="relative mt-3 h-[22px]">
            <span
              className="cnt-anim absolute inset-y-0 left-0 inline-flex items-center gap-2 font-tech text-[10px] uppercase tracking-[0.16em] text-[#A1A1AA]"
              style={{ animationName: "cnt-classify-pending" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#F97316]" />
              {t("m1Classifying")}
            </span>
            <span
              className="cnt-anim absolute inset-y-0 left-0 flex items-center gap-2"
              style={{ animationName: "cnt-classify-done" }}
            >
              <Badge tone="accent">{t("m1Project")}</Badge>
              <span className="font-tech text-[9px] uppercase tracking-[0.14em] text-[#22C55E]">
                {t("m1Confidence")}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. "Product in action" — supplier price comparison
// ---------------------------------------------------------------------------

const COMPARE_ROWS = [
  { v: ["185.—", "179.—", "192.—"], best: 1 },
  { v: ["68.—", "72.—", "64.—"], best: 2 },
  { v: ["2.85", "2.70", "2.95"], best: 1 },
];

export function CompareMockup() {
  const t = useTranslations("chantier.landingPage.action");
  const rows = [t("m2Row1"), t("m2Row2"), t("m2Row3")];
  const suppliers = [t("m2ColS1"), t("m2ColS2"), t("m2ColS3")];

  return (
    <div className="overflow-hidden border border-[#27272A] bg-[#18181B]">
      <WindowChrome title={t("m2Title")} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse">
          <thead>
            <tr className="border-b border-[#27272A]">
              <th className="px-3 py-2.5 text-left font-tech text-[9px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                {t("m2ColItem")}
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
              <tr
                key={label}
                className="cnt-anim border-b border-[#27272A]/70"
                style={{ animationName: "cnt-row-in", animationDelay: `${i * 0.28}s` }}
              >
                <td className="px-3 py-2.5 font-sans text-[12px] text-[#D4D4D8]">{label}</td>
                {COMPARE_ROWS[i].v.map((val, j) => (
                  <td key={j} className="px-1.5 py-2 text-right">
                    <span
                      className={`inline-block border px-2 py-1 font-tech text-[11px] tabular-nums ${
                        COMPARE_ROWS[i].best === j
                          ? "cnt-anim border-[#27272A] text-[#F97316]"
                          : "border-transparent text-[#A1A1AA]"
                      }`}
                      style={
                        COMPARE_ROWS[i].best === j
                          ? { animationName: "cnt-best-pulse", animationDelay: `${i * 0.28}s` }
                          : undefined
                      }
                    >
                      {val}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-3 py-3 font-tech text-[10px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                {t("m2Total")}
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
      <div className="border-t border-[#27272A] px-3 py-2">
        <Badge tone="accent">{t("m2Best")}</Badge>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. "Product in action" — Gantt bars filling in
// ---------------------------------------------------------------------------

const GANTT_BARS = [
  { offset: 0, width: 28 },
  { offset: 22, width: 34 },
  { offset: 48, width: 40 },
];

export function GanttMockup() {
  const t = useTranslations("chantier.landingPage.action");
  const tasks = [t("m3Task1"), t("m3Task2"), t("m3Task3")];

  return (
    <div className="overflow-hidden border border-[#27272A] bg-[#18181B]">
      <WindowChrome title={t("m3Title")} />
      <div className="px-4 py-5">
        <div className="mb-3 flex justify-between font-tech text-[9px] uppercase tracking-[0.16em] text-[#52525B]">
          <span>S12</span>
          <span>S16</span>
          <span>S20</span>
          <span>S24</span>
        </div>

        <div className="space-y-3">
          {tasks.map((name, i) => (
            <div key={name} className="grid grid-cols-[86px_1fr] items-center gap-3">
              <span className="truncate font-sans text-[11.5px] text-[#A1A1AA]">{name}</span>
              <div className="relative h-[16px] border-b border-dashed border-[#27272A]/80">
                <div
                  className="absolute inset-y-[2px]"
                  style={{ left: `${GANTT_BARS[i].offset}%`, width: `${GANTT_BARS[i].width}%` }}
                >
                  <div
                    className="cnt-anim h-full origin-left bg-[#F97316]"
                    style={{ animationName: "cnt-bar-grow", animationDelay: `${i * 0.3}s` }}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Milestone */}
          <div className="grid grid-cols-[86px_1fr] items-center gap-3">
            <span className="truncate font-sans text-[11.5px] text-[#A1A1AA]">{t("m3Task4")}</span>
            <div className="relative h-[16px]">
              <span
                className="cnt-anim absolute top-1/2 block h-[10px] w-[10px] -translate-y-1/2 rotate-45 border border-[#F97316] bg-[#0F0F11]"
                style={{ left: "88%", animationName: "cnt-classify-done", animationDelay: "0.9s" }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-[#27272A] pt-3">
          <Badge tone="accent">{t("m3Milestone")}</Badge>
          <span className="font-tech text-[9px] uppercase tracking-[0.16em] text-[#52525B]">
            {t("m3Progress")}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Static crane poster — replaces the WebGL scene below `lg`
// ---------------------------------------------------------------------------

export function CranePoster({ alt, caption }: { alt: string; caption: string }) {
  return (
    <figure className="relative w-full overflow-hidden bg-[#0A0A0C]" role="img" aria-label={alt}>
      {/* ground grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #F97316 1px, transparent 1px), linear-gradient(to bottom, #F97316 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "linear-gradient(to top, #000 0%, transparent 72%)",
          WebkitMaskImage: "linear-gradient(to top, #000 0%, transparent 72%)",
        }}
      />
      <svg
        viewBox="0 0 400 300"
        className="relative block h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
        focusable="false"
      >
        {/* horizon glow */}
        <defs>
          <linearGradient id="cnt-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F97316" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#0A0A0C" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="400" height="300" fill="url(#cnt-sky)" />

        {/* building volume */}
        <g stroke="#3F3F46" strokeWidth="1" fill="#111114">
          <rect x="46" y="150" width="120" height="112" />
          <rect x="166" y="176" width="74" height="86" />
        </g>
        <g stroke="#27272A" strokeWidth="1">
          {[168, 190, 212, 234].map((y) => (
            <line key={y} x1="46" y1={y} x2="166" y2={y} />
          ))}
          {[76, 106, 136].map((x) => (
            <line key={x} x1={x} y1="150" x2={x} y2="262" />
          ))}
        </g>

        {/* crane */}
        <g stroke="#F97316" strokeWidth="1.6" fill="none">
          <line x1="286" y1="262" x2="286" y2="60" />
          <line x1="278" y1="262" x2="278" y2="60" />
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={i} x1="278" y1={70 + i * 22} x2="286" y2={48 + i * 22} />
          ))}
          <line x1="110" y1="58" x2="340" y2="58" />
          <line x1="110" y1="66" x2="340" y2="66" />
          <line x1="282" y1="30" x2="140" y2="58" />
          <line x1="282" y1="30" x2="330" y2="58" />
          <line x1="282" y1="30" x2="282" y2="58" />
          <line x1="170" y1="66" x2="170" y2="132" />
        </g>
        <rect x="160" y="132" width="20" height="14" fill="#F97316" />

        {/* ground line */}
        <line x1="0" y1="262" x2="400" y2="262" stroke="#27272A" strokeWidth="1.5" />
      </svg>

      <figcaption className="border-t border-[#27272A] px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.18em] text-[#52525B]">
        {caption}
      </figcaption>
    </figure>
  );
}
