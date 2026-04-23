import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Hazard,
  RegMarks,
  SitePlacard,
  SiteStamp,
  FicheRow,
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
  const t = await getTranslations({ locale, namespace: "chantier.fondateurPage.seo" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `https://cantaia.io/${locale}/fondateur`,
      languages: {
        fr: "https://cantaia.io/fr/fondateur",
        en: "https://cantaia.io/en/fondateur",
        de: "https://cantaia.io/de/fondateur",
        "x-default": "https://cantaia.io/fr/fondateur",
      },
    },
  };
}

const TIMELINE_DATA = [
  { key: "step1", year: "2001" },
  { key: "step2", year: "2006" },
  { key: "step3", year: "2012" },
  { key: "step4", year: "2018" },
  { key: "step5", year: "2024" },
  { key: "step6", year: "2026" },
] as const;

const VALUES_DATA = [
  { key: "v1", code: "V01" },
  { key: "v2", code: "V02" },
  { key: "v3", code: "V03" },
  { key: "v4", code: "V04" },
] as const;

export default async function FondateurPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chantier.fondateurPage" });

  const founderJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Julien Ray",
    jobTitle: `${t("badge1")} — Cantaia`,
    worksFor: {
      "@type": "Organization",
      name: "Cantaia",
      url: "https://cantaia.io",
    },
    description: t("seo.description"),
    url: `https://cantaia.io/${locale}/fondateur`,
    nationality: "CH",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(founderJsonLd) }}
      />
      <main className="relative overflow-hidden bg-[#0A0A0C] text-[#FAFAFA]">
        <RegMarks blink={false} />

        {/* Fixed side axis (chantier signature) */}
        <div
          className="pointer-events-none fixed left-6 top-1/2 z-10 hidden -translate-y-1/2 -rotate-90 lg:block"
          aria-hidden
        >
          <span className="font-tech text-[10px] font-semibold tracking-[0.3em] text-[#52525B]">
            {t("sideAxis")}
          </span>
        </div>

        {/* ─────────────────────────────────────
            HERO · 03 · FICHE FONDATEUR
           ───────────────────────────────────── */}
        <section className="relative px-8 pt-28 pb-20">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-10 flex items-center gap-3">
              <Crosshair size={16} />
              <span className="font-tech text-[11px] font-bold tracking-[0.3em] text-[#F97316]">
                {t("hero.tag")}
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-[#F97316] via-[#27272A] to-transparent" />
              <span className="font-tech text-[10px] tracking-[0.2em] text-[#52525B]">
                {t("hero.dossier")}
              </span>
            </div>

            <div className="grid gap-14 lg:grid-cols-[1.4fr_1fr]">
              {/* Left — identity */}
              <div>
                <h1 className="font-condensed text-[72px] font-900 uppercase leading-[0.88] tracking-[-0.02em] text-[#FAFAFA] sm:text-[96px] lg:text-[120px]">
                  <span className="block">{t("hero.name1")}</span>
                  <span className="block text-[#F97316]">{t("hero.name2")}</span>
                </h1>
                <p className="mt-8 max-w-[520px] font-sans text-[17px] leading-relaxed text-[#A1A1AA]">
                  {t("hero.lede")}
                </p>
                <div className="mt-8 flex flex-wrap gap-2 font-tech text-[10px] font-semibold uppercase tracking-[0.18em] text-[#52525B]">
                  <span className="border border-[#27272A] px-3 py-1.5">
                    {t("hero.badge1")}
                  </span>
                  <span className="border border-[#27272A] px-3 py-1.5">
                    {t("hero.badge2")}
                  </span>
                  <span className="border border-[#27272A] px-3 py-1.5">
                    {t("hero.badge3")}
                  </span>
                </div>
              </div>

              {/* Right — identity card */}
              <div className="relative">
                <SitePlacard
                  lot={t("hero.cardLot")}
                  title={t("hero.cardTitle")}
                  cfc={t("hero.cardCfc")}
                />
                <div className="border border-t-0 border-[#27272A] bg-[#111114] px-6 py-6">
                  <FicheRow k={t("hero.fiche.nomKey")} v={t("hero.fiche.nomVal")} accent />
                  <FicheRow k={t("hero.fiche.neKey")} v={t("hero.fiche.neVal")} />
                  <FicheRow k={t("hero.fiche.formationKey")} v={t("hero.fiche.formationVal")} />
                  <FicheRow k={t("hero.fiche.languesKey")} v={t("hero.fiche.languesVal")} />
                  <FicheRow k={t("hero.fiche.experienceKey")} v={t("hero.fiche.experienceVal")} />
                  <FicheRow k={t("hero.fiche.rolesKey")} v={t("hero.fiche.rolesVal")} />
                  <FicheRow k={t("hero.fiche.projetsKey")} v={t("hero.fiche.projetsVal")} />
                  <FicheRow k={t("hero.fiche.volumeKey")} v={t("hero.fiche.volumeVal")} />
                  <FicheRow k={t("hero.fiche.cantaiaKey")} v={t("hero.fiche.cantaiaVal")} accent />
                </div>
                <div className="pointer-events-none absolute -right-2 -top-2 h-6 w-6 border-r-2 border-t-2 border-[#F97316]" />
                <div className="pointer-events-none absolute -bottom-2 -left-2 h-6 w-6 border-b-2 border-l-2 border-[#F97316]" />
              </div>
            </div>
          </div>
        </section>

        <Hazard height="h-[6px]" />

        {/* ─────────────────────────────────────
            NARRATIVE · POURQUOI CANTAIA
           ───────────────────────────────────── */}
        <section className="relative px-8 py-24">
          <div className="mx-auto max-w-[1400px]">
            <div className="grid gap-16 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <SectionHeader
                  step={t("narrative.sectionStep")}
                  title={t("narrative.sectionTitle")}
                  caption={t("narrative.sectionCaption")}
                />
              </div>

              <div className="space-y-10">
                <div>
                  <span className="font-tech text-[10px] font-bold tracking-[0.22em] text-[#F97316]">
                    {t("narrative.c1Tag")}
                  </span>
                  <p className="mt-3 font-sans text-[17px] leading-relaxed text-[#E4E4E7]">
                    {t("narrative.c1Before")}
                    <span className="bg-[#F97316]/15 px-1 text-[#F97316]">
                      {t("narrative.c1Highlight")}
                    </span>
                    {t("narrative.c1After")}
                  </p>
                </div>

                <div>
                  <span className="font-tech text-[10px] font-bold tracking-[0.22em] text-[#F97316]">
                    {t("narrative.c2Tag")}
                  </span>
                  <p className="mt-3 font-sans text-[17px] leading-relaxed text-[#E4E4E7]">
                    {t("narrative.c2Before")}
                    <span className="bg-[#F97316]/15 px-1 text-[#F97316]">
                      {t("narrative.c2Highlight")}
                    </span>
                    {t("narrative.c2After")}
                  </p>
                </div>

                <div>
                  <span className="font-tech text-[10px] font-bold tracking-[0.22em] text-[#F97316]">
                    {t("narrative.c3Tag")}
                  </span>
                  <p className="mt-3 font-sans text-[17px] leading-relaxed text-[#E4E4E7]">
                    {t("narrative.c3Before")}
                    <span className="bg-[#F97316]/15 px-1 text-[#F97316]">
                      {t("narrative.c3Highlight")}
                    </span>
                    {t("narrative.c3After")}
                  </p>
                </div>

                <div>
                  <span className="font-tech text-[10px] font-bold tracking-[0.22em] text-[#F97316]">
                    {t("narrative.c4Tag")}
                  </span>
                  <p className="mt-3 font-sans text-[17px] leading-relaxed text-[#E4E4E7]">
                    {t("narrative.c4Before")}
                    <span className="text-[#FAFAFA]">
                      {t("narrative.c4Emph")}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Hazard height="h-[6px]" />

        {/* ─────────────────────────────────────
            TIMELINE · PARCOURS
           ───────────────────────────────────── */}
        <section className="relative px-8 py-24">
          <div className="mx-auto max-w-[1400px]">
            <SectionHeader
              step={t("timeline.sectionStep")}
              title={t("timeline.sectionTitle")}
              caption={t("timeline.sectionCaption")}
              className="mb-16"
            />

            <div className="relative">
              {/* Vertical timeline line */}
              <div
                className="absolute left-0 top-0 bottom-0 hidden w-px bg-gradient-to-b from-[#F97316] via-[#27272A] to-transparent lg:block"
                style={{ left: "120px" }}
              />

              <ol className="space-y-6">
                {TIMELINE_DATA.map((step) => (
                  <li
                    key={step.year}
                    className="group relative grid gap-4 lg:grid-cols-[120px_1fr]"
                  >
                    {/* Year marker */}
                    <div className="flex items-center gap-3 lg:justify-end lg:pr-8">
                      <span className="font-condensed text-[28px] font-900 tracking-[-0.02em] text-[#F97316]">
                        {step.year}
                      </span>
                      <div className="hidden h-3 w-3 border-2 border-[#F97316] bg-[#0A0A0C] lg:block" />
                    </div>

                    {/* Card */}
                    <div className="border border-[#27272A] bg-[#111114] p-6 transition-colors hover:border-[#F97316]/60">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="font-tech text-[10px] font-bold tracking-[0.18em] text-[#F97316]">
                          {t(`timeline.${step.key}.lot`)}
                        </span>
                        <span className="font-tech text-[10px] tracking-[0.14em] text-[#52525B]">
                          {t(`timeline.${step.key}.place`)}
                        </span>
                      </div>
                      <h3 className="font-condensed text-[22px] font-800 uppercase tracking-[0.02em] text-[#FAFAFA]">
                        {t(`timeline.${step.key}.title`)}
                      </h3>
                      <p className="mt-2 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
                        {t(`timeline.${step.key}.body`)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <Hazard height="h-[6px]" />

        {/* ─────────────────────────────────────
            VALUES · PRINCIPES NON NÉGOCIABLES
           ───────────────────────────────────── */}
        <section className="relative overflow-hidden px-8 py-24">
          <div className="pointer-events-none absolute right-0 top-0 -translate-y-1/4 translate-x-1/4">
            <SiteStamp number="04" subtitle={t("values.stampSubtitle")} />
          </div>

          <div className="relative mx-auto max-w-[1400px]">
            <SectionHeader
              step={t("values.sectionStep")}
              title={t("values.sectionTitle")}
              caption={t("values.sectionCaption")}
              className="mb-14"
            />

            <div className="grid gap-px bg-[#27272A] sm:grid-cols-2">
              {VALUES_DATA.map((v) => (
                <div
                  key={v.code}
                  className="bg-[#0A0A0C] p-8 transition-colors hover:bg-[#111114]"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <Crosshair size={12} />
                    <span className="font-tech text-[11px] font-bold tracking-[0.22em] text-[#F97316]">
                      {t(`values.${v.key}.code`)}
                    </span>
                  </div>
                  <h3 className="font-condensed text-[26px] font-800 uppercase leading-[1.05] tracking-[0.01em] text-[#FAFAFA]">
                    {t(`values.${v.key}.title`)}
                  </h3>
                  <p className="mt-4 font-sans text-[15px] leading-relaxed text-[#A1A1AA]">
                    {t(`values.${v.key}.body`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Hazard height="h-[6px]" />

        {/* ─────────────────────────────────────
            CONTACT · CTA
           ───────────────────────────────────── */}
        <section className="relative overflow-hidden px-8 py-28">
          <div className="pointer-events-none absolute inset-0 opacity-[0.04]">
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  "linear-gradient(#F97316 1px, transparent 1px), linear-gradient(90deg, #F97316 1px, transparent 1px)",
                backgroundSize: "80px 80px",
              }}
            />
          </div>

          <div className="relative mx-auto max-w-[1100px] text-center">
            <div className="mb-8 flex items-center justify-center gap-3">
              <div className="h-px w-20 bg-gradient-to-r from-transparent to-[#F97316]" />
              <span className="font-tech text-[11px] font-bold tracking-[0.3em] text-[#F97316]">
                {t("contact.tag")}
              </span>
              <div className="h-px w-20 bg-gradient-to-l from-transparent to-[#F97316]" />
            </div>

            <h2 className="font-condensed text-[56px] font-900 uppercase leading-[0.92] tracking-[-0.01em] text-[#FAFAFA] sm:text-[80px]">
              {t("contact.title1")}
              <br />
              <span className="text-[#F97316]">{t("contact.title2")}</span> {t("contact.title3")}
            </h2>
            <p className="mx-auto mt-6 max-w-[560px] font-sans text-[16px] leading-relaxed text-[#A1A1AA]">
              {t("contact.lede")}
            </p>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
              <ChantierButton href="mailto:julien@cantaia.io" variant="primary">
                {t("contact.ctaEmail")}
              </ChantierButton>
              <ChantierButton href="/register" variant="ghost">
                {t("contact.ctaTrial")}
              </ChantierButton>
            </div>

            <div className="mt-16 flex flex-wrap items-center justify-center gap-6 font-tech text-[10px] font-semibold tracking-[0.22em] text-[#52525B]">
              <span>{t("contact.foot1")}</span>
              <span className="h-1 w-1 bg-[#3F3F46]" />
              <span>{t("contact.foot2")}</span>
              <span className="h-1 w-1 bg-[#3F3F46]" />
              <span>{t("contact.foot3")}</span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
