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
  const t = await getTranslations({ locale, namespace: "chantier.produitsPage.seo" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `https://cantaia.io/${locale}/produits`,
      languages: {
        fr: "https://cantaia.io/fr/produits",
        en: "https://cantaia.io/en/produits",
        de: "https://cantaia.io/de/produits",
        "x-default": "https://cantaia.io/fr/produits",
      },
    },
  };
}

type StatusKey = "actif" | "actifBeta" | "masque";

type ProduitMeta = {
  key: string;
  lot: string;
  code: string;
  accent: string;
  statusKey: StatusKey;
  statValue: string;
  /** Universal unit (kept local); when undefined and localizedUnit=true, unit pulled from i18n `statUnit`. */
  statUnit?: string;
  /** When true, pulls unit from i18n key products.${key}.statUnit */
  localizedUnit?: boolean;
};

const PRODUITS_DATA: ProduitMeta[] = [
  {
    key: "p1",
    lot: "LOT · 01",
    code: "CFC·COM·211",
    accent: "#F97316",
    statusKey: "actif",
    statValue: "94",
    statUnit: "%",
  },
  {
    key: "p2",
    lot: "LOT · 02",
    code: "CFC·ADM·221",
    accent: "#F97316",
    statusKey: "actif",
    statValue: "42",
    statUnit: "h",
  },
  {
    key: "p3",
    lot: "LOT · 03",
    code: "CFC·DOC·212",
    accent: "#FACC15",
    statusKey: "actifBeta",
    statValue: "35",
    statUnit: "min",
  },
  {
    key: "p4",
    lot: "LOT · 04",
    code: "CFC·PLN·201",
    accent: "#F97316",
    statusKey: "actif",
    statValue: "12",
    localizedUnit: true,
  },
  {
    key: "p5",
    lot: "LOT · 05",
    code: "CFC·PLG·401",
    accent: "#3B82F6",
    statusKey: "actif",
    statValue: "180",
    localizedUnit: true,
  },
  {
    key: "p6",
    lot: "LOT · 06",
    code: "CFC·POR·501",
    accent: "#22C55E",
    statusKey: "actif",
    statValue: "0",
    statUnit: "",
  },
  {
    key: "p7",
    lot: "LOT · 07",
    code: "CFC·RPT·503",
    accent: "#22C55E",
    statusKey: "actif",
    statValue: "6",
    localizedUnit: true,
  },
  {
    key: "p8",
    lot: "LOT · 08",
    code: "CFC·SUP·902",
    accent: "#3B82F6",
    statusKey: "actif",
    statValue: "4",
    statUnit: "h",
  },
  {
    key: "p9",
    lot: "LOT · 09",
    code: "CFC·IA·701",
    accent: "#F97316",
    statusKey: "actif",
    statValue: "3",
    statUnit: "",
  },
  {
    key: "p10",
    lot: "LOT · 10",
    code: "CFC·DIR·601",
    accent: "#EA580C",
    statusKey: "actif",
    statValue: "12",
    statUnit: "",
  },
  {
    key: "p11",
    lot: "LOT · 11",
    code: "CFC·PRX·301",
    accent: "#71717A",
    statusKey: "masque",
    statValue: "—",
    statUnit: "",
  },
];

const PRODUIT_NAMES: Record<string, string> = {
  p1: "Cantaia Mail",
  p2: "Cantaia Soumissions",
  p3: "Cantaia PV",
  p4: "Plans",
  p5: "Planning",
  p6: "Portail Chef d'Équipe",
  p7: "Rapports Chantier",
  p8: "Support Tickets",
  p9: "Table Ronde IA",
  p10: "Direction & Financials",
  p11: "Cantaia Prix",
};

export default async function ProduitsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chantier.produitsPage" });

  const activeCount = PRODUITS_DATA.filter((p) =>
    p.statusKey.startsWith("actif")
  ).length;

  const produitsJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Cantaia — 11 modules",
    numberOfItems: PRODUITS_DATA.length,
    itemListElement: PRODUITS_DATA.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SoftwareApplication",
        name: PRODUIT_NAMES[p.key],
        applicationCategory: "BusinessApplication",
        description: t(`products.${p.key}.description`),
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(produitsJsonLd) }}
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
                {t("hero.rightTag")}
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
                  code="P01"
                  value={String(activeCount)}
                  label={t("hero.metric1Label")}
                  source="LIVE"
                />
                <MetricTag
                  code="P02"
                  value="3"
                  label={t("hero.metric2Label")}
                  unit="Claude · GPT · Gemini"
                  source="LLM"
                />
                <MetricTag
                  code="P03"
                  value="3"
                  label={t("hero.metric3Label")}
                  unit="FR · DE · EN"
                />
                <MetricTag
                  code="P04"
                  value={t("hero.metric4Value")}
                  label={t("hero.metric4Label")}
                  source="RGPD"
                  active
                />
              </div>
            </div>
          </div>
        </section>

        <Hazard height="h-[6px]" />

        {/* ─────────────────────────────────────
            GRID PRODUITS
           ───────────────────────────────────── */}
        <section className="relative px-8 py-20">
          <div className="mx-auto max-w-[1400px]">
            <SectionHeader
              step={t("grid.sectionStep")}
              title={t("grid.sectionTitle")}
              caption={t("grid.sectionCaption")}
              className="mb-14"
            />

            <div className="grid gap-px bg-[#27272A] md:grid-cols-2 lg:grid-cols-3">
              {PRODUITS_DATA.map((p) => {
                const statusLabel = t(`status.${p.statusKey}`);
                const statusColor =
                  p.statusKey === "masque"
                    ? "text-[#52525B]"
                    : p.statusKey === "actifBeta"
                    ? "text-[#FACC15]"
                    : "text-[#22C55E]";
                return (
                  <article
                    key={p.code}
                    className="group relative flex flex-col bg-[#0A0A0C] p-7 transition-colors hover:bg-[#111114]"
                  >
                    {/* Status ribbon */}
                    <div className="mb-5 flex items-center justify-between">
                      <span
                        className="font-tech text-[10px] font-bold tracking-[0.22em]"
                        style={{ color: p.accent }}
                      >
                        {p.lot}
                      </span>
                      <span
                        className={`font-tech text-[9px] font-bold tracking-[0.18em] ${statusColor}`}
                      >
                        ● {statusLabel}
                      </span>
                    </div>

                    {/* Name */}
                    <h3 className="font-condensed text-[30px] font-900 uppercase leading-[0.95] tracking-[-0.01em] text-[#FAFAFA]">
                      {PRODUIT_NAMES[p.key]}
                    </h3>
                    <p className="mt-1 font-tech text-[11px] font-semibold tracking-[0.18em] text-[#71717A]">
                      {t(`products.${p.key}.tagline`).toUpperCase()}
                    </p>

                    {/* CFC code tag */}
                    <div className="mt-4 inline-flex w-fit items-center gap-2 border border-[#27272A] bg-[#18181B] px-2.5 py-1">
                      <span
                        className="h-1.5 w-1.5"
                        style={{ backgroundColor: p.accent }}
                      />
                      <span className="font-tech text-[10px] font-semibold tracking-[0.16em] text-[#A1A1AA]">
                        {p.code}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="mt-5 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
                      {t(`products.${p.key}.description`)}
                    </p>

                    {/* Bullets */}
                    <ul className="mt-5 space-y-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <li
                          key={`${p.key}-b${n}`}
                          className="flex items-start gap-2.5 font-sans text-[13px] text-[#E4E4E7]"
                        >
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0"
                            style={{ backgroundColor: p.accent }}
                          />
                          <span>{t(`products.${p.key}.bullet${n}`)}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Stat footer */}
                    <div className="mt-auto pt-6">
                      <div className="border-t border-dashed border-[#27272A] pt-4">
                        <div className="flex items-baseline gap-2">
                          <span className="font-condensed text-[36px] font-900 leading-none tracking-[-0.02em] text-[#FAFAFA]">
                            {p.statValue}
                          </span>
                          {(p.localizedUnit || p.statUnit) && (
                            <span className="font-tech text-[11px] font-semibold tracking-[0.1em] text-[#A1A1AA]">
                              {p.localizedUnit ? t(`products.${p.key}.statUnit`) : p.statUnit}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 font-tech text-[10px] font-semibold uppercase tracking-[0.18em] text-[#52525B]">
                          {t(`products.${p.key}.statLabel`)}
                        </div>
                      </div>
                    </div>

                    {/* Corner marks */}
                    <div
                      className="pointer-events-none absolute right-3 top-3 h-3 w-3 border-r border-t opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ borderColor: p.accent }}
                    />
                    <div
                      className="pointer-events-none absolute bottom-3 left-3 h-3 w-3 border-b border-l opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ borderColor: p.accent }}
                    />
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <Hazard height="h-[6px]" />

        {/* ─────────────────────────────────────
            INTEROP · COMMENT ÇA S'IMBRIQUE
           ───────────────────────────────────── */}
        <section className="relative overflow-hidden px-8 py-24">
          <div className="pointer-events-none absolute left-0 top-0 -translate-y-1/4 -translate-x-1/4">
            <SiteStamp number="11" subtitle={t("interop.stampSubtitle")} />
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
                  lot={t("interop.f1Lot")}
                  title={t("interop.f1Title")}
                  cfc="AUTO"
                />
                <p className="mt-5 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
                  {t("interop.f1Body")}
                </p>
              </div>

              <div className="border border-[#27272A] bg-[#111114] p-7">
                <SitePlacard
                  lot={t("interop.f2Lot")}
                  title={t("interop.f2Title")}
                  cfc="IA"
                />
                <p className="mt-5 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
                  {t("interop.f2Body")}
                </p>
              </div>

              <div className="border border-[#27272A] bg-[#111114] p-7">
                <SitePlacard
                  lot={t("interop.f3Lot")}
                  title={t("interop.f3Title")}
                  cfc="LIVE"
                />
                <p className="mt-5 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
                  {t("interop.f3Body")}
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
              <ChantierButton href="/pricing" variant="ghost">
                {t("cta.ctaSecondary")}
              </ChantierButton>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
