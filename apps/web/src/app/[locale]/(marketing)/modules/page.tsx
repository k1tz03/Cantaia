import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Hazard,
  RegMarks,
  SitePlacard,
  SiteStamp,
  MetricTag,
  SectionHeader,
  ChantierButton,
  Crosshair,
} from "@/components/chantier/primitives";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chantier.modulesPage.seo" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `https://cantaia.io/${locale}/modules`,
      languages: {
        fr: "https://cantaia.io/fr/modules",
        en: "https://cantaia.io/en/modules",
        de: "https://cantaia.io/de/modules",
        "x-default": "https://cantaia.io/fr/modules",
      },
    },
  };
}

type ModuleMeta = {
  key: string;
  num: string;
  lot: string;
  cfc: string;
  accent: string;
  statValue: string;
  /** Universal unit (kept local); when undefined and localizedUnit=true, unit pulled from i18n `statUnit`. */
  statUnit?: string;
  /** When true, pulls unit from i18n key modules.${key}.statUnit */
  localizedUnit?: boolean;
};

const MODULES_DATA: ModuleMeta[] = [
  {
    key: "m1",
    num: "M01",
    lot: "LOT · 01",
    cfc: "CFC·COM·211",
    accent: "#F97316",
    statValue: "2.4",
    statUnit: "h",
  },
  {
    key: "m2",
    num: "M02",
    lot: "LOT · 02",
    cfc: "CFC·ADM·221",
    accent: "#F97316",
    statValue: "42",
    statUnit: "h",
  },
  {
    key: "m3",
    num: "M03",
    lot: "LOT · 03",
    cfc: "CFC·DOC·212",
    accent: "#FACC15",
    statValue: "35",
    statUnit: "min",
  },
  {
    key: "m4",
    num: "M04",
    lot: "LOT · 04",
    cfc: "CFC·PLN·201",
    accent: "#F97316",
    statValue: "12",
    localizedUnit: true,
  },
  {
    key: "m5",
    num: "M05",
    lot: "LOT · 05",
    cfc: "CFC·PLG·401",
    accent: "#3B82F6",
    statValue: "90",
    statUnit: "s",
  },
  {
    key: "m6",
    num: "M06",
    lot: "LOT · 06",
    cfc: "CFC·POR·501",
    accent: "#22C55E",
    statValue: "0",
  },
];

export default async function ModulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chantier.modulesPage" });

  const modulesJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Cantaia — Modules & Workflows",
    numberOfItems: MODULES_DATA.length,
    itemListElement: MODULES_DATA.map((m, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Service",
        name: t(`modules.${m.key}.name`),
        description: t(`modules.${m.key}.pitch`),
        serviceType: t(`modules.${m.key}.subtitle`),
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(modulesJsonLd) }}
      />
      <main className="relative overflow-hidden bg-[#0A0A0C] text-[#FAFAFA]">
        <RegMarks blink={false} />

        <div
          className="pointer-events-none fixed left-6 top-1/2 z-10 hidden -translate-y-1/2 -rotate-90 lg:block"
          aria-hidden
        >
          <span className="font-tech text-[10px] font-semibold tracking-[0.3em] text-[#52525B]">
            {t("sideAxis")}
          </span>
        </div>

        {/* ─────────────────────────────────────
            HERO
           ───────────────────────────────────── */}
        <section className="relative px-8 pt-28 pb-16">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-10 flex items-center gap-3">
              <Crosshair size={16} />
              <span className="font-tech text-[11px] font-bold tracking-[0.3em] text-[#F97316]">
                {t("hero.tag")}
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-[#F97316] via-[#27272A] to-transparent" />
              <span className="font-tech text-[10px] tracking-[0.2em] text-[#52525B]">
                {MODULES_DATA.length} {t("hero.rightTagSuffix")}
              </span>
            </div>

            <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
              <div>
                <h1 className="font-condensed text-[64px] font-900 uppercase leading-[0.9] tracking-[-0.02em] text-[#FAFAFA] sm:text-[88px] lg:text-[112px]">
                  <span className="block">{t("hero.title1")}</span>
                  <span className="block">{t("hero.title2")}</span>
                  <span className="block text-[#F97316]">{t("hero.title3")}</span>
                </h1>
                <p className="mt-8 max-w-[560px] font-sans text-[17px] leading-relaxed text-[#A1A1AA]">
                  {t("hero.lede")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetricTag
                  code="M01"
                  value="6"
                  label={t("hero.metric1Label")}
                />
                <MetricTag
                  code="M02"
                  value="42"
                  label={t("hero.metric2Label")}
                  unit="h"
                  source="TERRAIN"
                />
                <MetricTag
                  code="M03"
                  value="94"
                  label={t("hero.metric3Label")}
                  unit="%"
                  source="CLAUDE"
                />
                <MetricTag
                  code="M04"
                  value="0"
                  label={t("hero.metric4Label")}
                  active
                />
              </div>
            </div>
          </div>
        </section>

        <Hazard height="h-[6px]" />

        {/* ─────────────────────────────────────
            MODULES DÉTAILLÉS
           ───────────────────────────────────── */}
        {MODULES_DATA.map((m, idx) => (
          <section
            key={m.num}
            className="relative px-8 py-20"
          >
            {idx % 2 === 1 && (
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage:
                    "linear-gradient(#F97316 1px, transparent 1px)",
                  backgroundSize: "100% 60px",
                }}
                aria-hidden
              />
            )}

            <div className="relative mx-auto max-w-[1400px]">
              <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
                {/* Left — header */}
                <div className="lg:sticky lg:top-28 lg:self-start">
                  <div className="mb-6 flex items-center gap-3">
                    <span
                      className="font-tech text-[11px] font-bold tracking-[0.3em]"
                      style={{ color: m.accent }}
                    >
                      {m.lot}
                    </span>
                    <span className="font-tech text-[10px] tracking-[0.18em] text-[#52525B]">
                      {m.cfc}
                    </span>
                  </div>

                  <div className="mb-6 inline-flex items-center gap-2 border border-[#27272A] bg-[#111114] px-3 py-1.5">
                    <span
                      className="h-1.5 w-1.5"
                      style={{ backgroundColor: m.accent }}
                    />
                    <span className="font-tech text-[11px] font-semibold tracking-[0.18em] text-[#A1A1AA]">
                      {t("labels.module")} · {m.num}
                    </span>
                  </div>

                  <h2 className="font-condensed text-[52px] font-900 uppercase leading-[0.95] tracking-[-0.01em] text-[#FAFAFA] sm:text-[64px]">
                    {t(`modules.${m.key}.name`)}
                  </h2>
                  <p className="mt-3 font-tech text-[12px] font-semibold tracking-[0.18em] text-[#71717A]">
                    {t(`modules.${m.key}.subtitle`).toUpperCase()}
                  </p>

                  <p className="mt-8 font-sans text-[15px] leading-relaxed text-[#A1A1AA]">
                    {t(`modules.${m.key}.pitch`)}
                  </p>

                  {/* Big stat */}
                  <div className="mt-10 border-l-2 border-[#F97316] pl-5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-condensed text-[58px] font-900 leading-none tracking-[-0.03em] text-[#FAFAFA]">
                        {m.statValue}
                      </span>
                      {(m.localizedUnit || m.statUnit) && (
                        <span className="font-tech text-[14px] font-semibold tracking-[0.1em] text-[#F97316]">
                          {m.localizedUnit ? t(`modules.${m.key}.statUnit`) : m.statUnit}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-tech text-[10px] font-semibold uppercase tracking-[0.2em] text-[#52525B]">
                      {t(`modules.${m.key}.statLabel`)}
                    </div>
                  </div>
                </div>

                {/* Right — features + workflow */}
                <div className="space-y-10">
                  {/* What it replaces */}
                  <div className="border border-[#27272A] bg-[#111114] p-6">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="h-2 w-2 bg-[#EF4444]" />
                      <span className="font-tech text-[11px] font-bold tracking-[0.22em] text-[#EF4444]">
                        {t("labels.remplace")}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {[1, 2, 3].map((n) => (
                        <li
                          key={`${m.key}-r${n}`}
                          className="flex items-start gap-3 font-sans text-[14px] text-[#A1A1AA] line-through decoration-[#27272A]"
                        >
                          <span className="mt-1 text-[#52525B]">—</span>
                          <span>{t(`modules.${m.key}.replace${n}`)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Features */}
                  <div className="space-y-4">
                    {[1, 2, 3].map((n) => (
                      <div
                        key={`${m.key}-f${n}`}
                        className="group border border-[#27272A] bg-[#0A0A0C] p-6 transition-colors hover:border-[#F97316]/60"
                      >
                        <div className="mb-3 flex items-center gap-3">
                          <span className="font-tech text-[10px] font-bold tracking-[0.22em] text-[#F97316]">
                            {`F0${n}`}
                          </span>
                          <h4 className="font-condensed text-[18px] font-800 uppercase tracking-[0.02em] text-[#FAFAFA]">
                            {t(`modules.${m.key}.f${n}Label`)}
                          </h4>
                        </div>
                        <p className="font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
                          {t(`modules.${m.key}.f${n}Detail`)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Workflow strip */}
                  <div className="border border-[#27272A] bg-[#111114] p-6">
                    <div className="mb-5 flex items-center gap-3">
                      <Crosshair size={12} />
                      <span className="font-tech text-[11px] font-bold tracking-[0.22em] text-[#F97316]">
                        {t("labels.workflow")} · {m.num}
                      </span>
                    </div>
                    <ol className="flex flex-wrap items-center gap-2">
                      {[1, 2, 3, 4, 5].map((n, i) => (
                        <li
                          key={`${m.key}-wf${n}`}
                          className="flex items-center gap-2"
                        >
                          <span className="inline-flex items-center gap-2 border border-[#27272A] bg-[#0A0A0C] px-3 py-1.5 font-tech text-[11px] font-semibold tracking-[0.1em] text-[#E4E4E7]">
                            <span className="font-bold text-[#F97316]">
                              {String(n).padStart(2, "0")}
                            </span>
                            <span>{t(`modules.${m.key}.wf${n}`)}</span>
                          </span>
                          {i < 4 && (
                            <span className="text-[#3F3F46]">→</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            {idx < MODULES_DATA.length - 1 && (
              <div className="mx-auto mt-20 max-w-[1400px]">
                <Hazard height="h-[4px]" />
              </div>
            )}
          </section>
        ))}

        <Hazard height="h-[6px]" />

        {/* ─────────────────────────────────────
            INTEROP — GIANT SIX
           ───────────────────────────────────── */}
        <section className="relative overflow-hidden px-8 py-28">
          <div className="pointer-events-none absolute right-0 top-0 -translate-y-1/4 translate-x-1/4">
            <SiteStamp number="06" subtitle={t("interop.stampSubtitle")} />
          </div>

          <div className="relative mx-auto max-w-[1400px]">
            <SectionHeader
              step={t("interop.sectionStep")}
              title={t("interop.sectionTitle")}
              caption={t("interop.sectionCaption")}
              className="mb-14"
            />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="border border-[#27272A] bg-[#111114] p-7">
                <SitePlacard
                  lot={t("interop.c1Lot")}
                  title={t("interop.c1Title")}
                  cfc="AUTO"
                />
                <p className="mt-5 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
                  {t("interop.c1Body")}
                </p>
              </div>

              <div className="border border-[#27272A] bg-[#111114] p-7">
                <SitePlacard
                  lot={t("interop.c2Lot")}
                  title={t("interop.c2Title")}
                  cfc="IA"
                />
                <p className="mt-5 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
                  {t("interop.c2Body")}
                </p>
              </div>

              <div className="border border-[#27272A] bg-[#111114] p-7">
                <SitePlacard
                  lot={t("interop.c3Lot")}
                  title={t("interop.c3Title")}
                  cfc="LIVE"
                />
                <p className="mt-5 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
                  {t("interop.c3Body")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <Hazard height="h-[6px]" />

        {/* ─────────────────────────────────────
            FINAL CTA
           ───────────────────────────────────── */}
        <section className="relative px-8 py-28">
          <div className="mx-auto max-w-[1100px] text-center">
            <div className="mb-8 flex items-center justify-center gap-3">
              <div className="h-px w-20 bg-gradient-to-r from-transparent to-[#F97316]" />
              <span className="font-tech text-[11px] font-bold tracking-[0.3em] text-[#F97316]">
                {t("cta.tag")}
              </span>
              <div className="h-px w-20 bg-gradient-to-l from-transparent to-[#F97316]" />
            </div>

            <h2 className="font-condensed text-[56px] font-900 uppercase leading-[0.92] tracking-[-0.01em] text-[#FAFAFA] sm:text-[80px]">
              {t("cta.title1")}
              <br />
              <span className="text-[#F97316]">{t("cta.title2")}</span>
            </h2>
            <p className="mx-auto mt-6 max-w-[560px] font-sans text-[16px] leading-relaxed text-[#A1A1AA]">
              {t("cta.lede")}
            </p>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
              <ChantierButton href="/register" variant="primary">
                {t("cta.ctaPrimary")}
              </ChantierButton>
              <ChantierButton href="/produits" variant="ghost">
                {t("cta.ctaSecondary")}
              </ChantierButton>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
