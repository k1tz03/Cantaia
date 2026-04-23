import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  ChantierButton,
  FicheRow,
  Hazard,
  RegMarks,
  SectionHeader,
  SitePlacard,
  SiteStamp,
} from "@/components/chantier/primitives";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chantier.pricingPage.seo" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `https://cantaia.io/${locale}/pricing`,
      languages: {
        fr: "https://cantaia.io/fr/pricing",
        en: "https://cantaia.io/en/pricing",
        de: "https://cantaia.io/de/pricing",
      },
    },
  };
}

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Cantaia",
  description:
    "AI-powered construction management: email triage, submissions, meeting minutes, planning, field portal, AI chat.",
  brand: { "@type": "Brand", name: "Cantaia" },
  offers: {
    "@type": "AggregateOffer",
    url: "https://cantaia.io/fr/pricing",
    priceCurrency: "CHF",
    lowPrice: "49",
    highPrice: "119",
    offerCount: "3",
    availability: "https://schema.org/InStock",
  },
};

type Plan = {
  code: string;
  name: string;
  price: number;
  min: string;
  max: string;
  tagline: string;
  highlight: boolean;
  features: string[];
  ctaHref: string;
  ctaLabel: string;
  ctaVariant: "primary" | "ghost";
};

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chantier.pricingPage" });

  const PLANS: Plan[] = [
    {
      code: t("plans.starter.code"),
      name: t("plans.starter.name"),
      price: 49,
      min: t("plans.starter.min"),
      max: t("plans.starter.max"),
      tagline: t("plans.starter.tagline"),
      highlight: false,
      features: [
        t("plans.starter.feature1"),
        t("plans.starter.feature2"),
        t("plans.starter.feature3"),
        t("plans.starter.feature4"),
        t("plans.starter.feature5"),
        t("plans.starter.feature6"),
        t("plans.starter.feature7"),
        t("plans.starter.feature8"),
      ],
      ctaHref: "/register",
      ctaLabel: t("plans.starter.ctaLabel"),
      ctaVariant: "ghost",
    },
    {
      code: t("plans.pro.code"),
      name: t("plans.pro.name"),
      price: 89,
      min: t("plans.pro.min"),
      max: t("plans.pro.max"),
      tagline: t("plans.pro.tagline"),
      highlight: true,
      features: [
        t("plans.pro.feature1"),
        t("plans.pro.feature2"),
        t("plans.pro.feature3"),
        t("plans.pro.feature4"),
        t("plans.pro.feature5"),
        t("plans.pro.feature6"),
        t("plans.pro.feature7"),
        t("plans.pro.feature8"),
        t("plans.pro.feature9"),
        t("plans.pro.feature10"),
        t("plans.pro.feature11"),
      ],
      ctaHref: "/register",
      ctaLabel: t("plans.pro.ctaLabel"),
      ctaVariant: "primary",
    },
    {
      code: t("plans.enterprise.code"),
      name: t("plans.enterprise.name"),
      price: 119,
      min: t("plans.enterprise.min"),
      max: t("plans.enterprise.max"),
      tagline: t("plans.enterprise.tagline"),
      highlight: false,
      features: [
        t("plans.enterprise.feature1"),
        t("plans.enterprise.feature2"),
        t("plans.enterprise.feature3"),
        t("plans.enterprise.feature4"),
        t("plans.enterprise.feature5"),
        t("plans.enterprise.feature6"),
        t("plans.enterprise.feature7"),
        t("plans.enterprise.feature8"),
        t("plans.enterprise.feature9"),
        t("plans.enterprise.feature10"),
      ],
      ctaHref: "mailto:contact@cantaia.io",
      ctaLabel: t("plans.enterprise.ctaLabel"),
      ctaVariant: "ghost",
    },
  ];

  const faqItems = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
    { q: t("faq.q5"), a: t("faq.a5") },
    { q: t("faq.q6"), a: t("faq.a6") },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0A0C] text-[#FAFAFA]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <RegMarks blink={false} />

      {/* Coord tag */}
      <div className="pointer-events-none fixed left-8 top-20 z-20 font-tech text-[10px] tracking-[0.18em] text-[#52525B]">
        {t("coordTag")}
      </div>

      {/* Hero */}
      <section className="relative px-8 pb-16 pt-24">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-6 flex items-center gap-3">
            <div className="h-[1px] w-12 bg-[#F97316]" />
            <span className="font-tech text-[11px] font-bold tracking-[0.3em] text-[#F97316]">
              {t("hero.sectionMarker")}
            </span>
          </div>

          <h1 className="font-condensed text-[68px] font-900 uppercase leading-[0.92] tracking-[-0.02em] text-[#FAFAFA] sm:text-[96px]">
            {t("hero.titleLine1")}
            <br />
            <span className="text-[#F97316]">{t("hero.titleLine2")}</span>
            <br />
            {t("hero.titleLine3")}
          </h1>

          <p className="mt-8 max-w-[640px] font-sans text-[17px] leading-relaxed text-[#A1A1AA]">
            {t("hero.description")}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-[#27272A] pt-6 font-tech text-[11px] tracking-[0.18em] text-[#71717A]">
            <span>{t("hero.tag1")}</span>
            <span className="text-[#3F3F46]">·</span>
            <span>{t("hero.tag2")}</span>
            <span className="text-[#3F3F46]">·</span>
            <span>{t("hero.tag3")}</span>
            <span className="text-[#3F3F46]">·</span>
            <span>{t("hero.tag4")}</span>
          </div>
        </div>
      </section>

      <Hazard />

      {/* Plans grid */}
      <section className="relative bg-[#09090B] px-8 py-24">
        <SiteStamp
          number="49"
          subtitle={t("stamp.subtitle")}
          className="pointer-events-none absolute -right-6 top-20 opacity-30"
        />

        <div className="relative mx-auto max-w-[1400px]">
          <SectionHeader
            step={t("plans.sectionStep")}
            title={t("plans.sectionTitle")}
            caption={t("plans.sectionCaption")}
            className="mb-16"
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <article
                key={plan.code}
                className={`group relative flex flex-col border bg-[#0A0A0C] transition-colors ${
                  plan.highlight
                    ? "border-[#F97316] shadow-[0_0_0_1px_#F97316_inset]"
                    : "border-[#27272A] hover:border-[#F97316]/60"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-[13px] left-8 bg-[#F97316] px-3 py-1 font-tech text-[10px] font-bold uppercase tracking-[0.22em] text-[#0A0A0C]">
                    {t("plans.recommended")}
                  </div>
                )}

                <SitePlacard
                  lot={plan.code}
                  title={plan.name}
                  cfc={`${t("plans.priceCurrency")} ${plan.price}`}
                />

                <div className="flex flex-1 flex-col px-6 py-8">
                  <div className="font-tech text-[11px] font-semibold uppercase tracking-[0.2em] text-[#52525B]">
                    {plan.tagline}
                  </div>

                  <div className="mt-6 flex items-baseline gap-2">
                    <span className="font-condensed text-[72px] font-900 leading-none tracking-[-0.03em] text-[#FAFAFA]">
                      {plan.price}
                    </span>
                    <span className="font-tech text-[12px] font-semibold tracking-[0.08em] text-[#A1A1AA]">
                      {t("plans.priceCurrency")}
                    </span>
                  </div>
                  <div className="mt-1 font-condensed text-[13px] font-600 uppercase tracking-[0.14em] text-[#71717A]">
                    {t("plans.priceUnit")}
                  </div>

                  <div className="mt-6 space-y-1 border-y border-dashed border-[#27272A] py-4">
                    <FicheRow k={t("plans.minLabel")} v={plan.min} />
                    <FicheRow k={t("plans.maxLabel")} v={plan.max} />
                  </div>

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-3 font-sans text-[14px] leading-relaxed text-[#D4D4D8]"
                      >
                        <span
                          className={`mt-[6px] h-[8px] w-[8px] flex-shrink-0 ${
                            plan.highlight ? "bg-[#F97316]" : "bg-[#3F3F46]"
                          }`}
                          aria-hidden
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    <ChantierButton
                      href={plan.ctaHref}
                      variant={plan.ctaVariant}
                      className="w-full justify-center"
                    >
                      {plan.ctaLabel}
                    </ChantierButton>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-12 border border-[#27272A] bg-[#111114] p-6 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
            <div className="flex items-center gap-3">
              <span className="font-tech text-[11px] font-bold uppercase tracking-[0.2em] text-[#F97316]">
                {t("plans.note.label")}
              </span>
              <span className="font-tech text-[10px] tracking-[0.18em] text-[#52525B]">
                {t("plans.note.ref")}
              </span>
            </div>
            <p className="mt-3">
              {t("plans.note.textBefore")}{" "}
              <a
                href="mailto:contact@cantaia.io"
                className="text-[#F97316] underline underline-offset-4 hover:text-[#FB923C]"
              >
                contact@cantaia.io
              </a>
              {t("plans.note.textAfter")}
            </p>
          </div>
        </div>
      </section>

      <Hazard height="h-[22px]" />

      {/* FAQ strip */}
      <section className="px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeader
            step={t("faq.sectionStep")}
            title={t("faq.sectionTitle")}
            caption={t("faq.sectionCaption")}
            className="mb-12"
          />

          <div className="grid grid-cols-1 gap-px bg-[#27272A] md:grid-cols-2">
            {faqItems.map((item) => (
              <div key={item.q} className="bg-[#0A0A0C] p-6">
                <h3 className="font-condensed text-[22px] font-800 uppercase leading-tight tracking-[-0.01em] text-[#FAFAFA]">
                  {item.q}
                </h3>
                <p className="mt-3 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Hazard />

      {/* Final CTA */}
      <section className="relative bg-[#09090B] px-8 py-32">
        <div className="mx-auto max-w-[1100px] text-center">
          <div className="inline-flex items-center gap-3 border border-[#F97316]/40 bg-[#0A0A0C] px-4 py-2">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F97316]" />
            <span className="font-tech text-[11px] font-bold tracking-[0.3em] text-[#F97316]">
              {t("finalCta.badge")}
            </span>
          </div>

          <h2 className="mt-8 font-condensed text-[64px] font-900 uppercase leading-[0.92] tracking-[-0.02em] text-[#FAFAFA] sm:text-[88px]">
            {t("finalCta.titleLine1")}
            <br />
            <span className="text-[#F97316]">{t("finalCta.titleLine2")}</span>
          </h2>

          <p className="mx-auto mt-8 max-w-[560px] font-sans text-[17px] leading-relaxed text-[#A1A1AA]">
            {t("finalCta.description")}
          </p>

          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <ChantierButton href="/register" variant="primary">
              {t("finalCta.ctaPrimary")}
            </ChantierButton>
            <ChantierButton href="/fondateur" variant="ghost">
              {t("finalCta.ctaSecondary")}
            </ChantierButton>
          </div>
        </div>
      </section>
    </main>
  );
}
