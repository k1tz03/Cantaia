import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ChantierButton,
  Hazard,
  RegMarks,
  SectionHeader,
  SitePlacard,
  SiteStamp,
} from "@/components/chantier/primitives";
import {
  BEST_PRICE_PACK_ID,
  CREDIT_PACK_LIST,
  CREDIT_PLAN_LIST,
  RECOMMENDED_PLAN_ID,
  SIGNUP_BONUS_CREDITS,
  creditCostFor,
} from "@/components/credits/credit-config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chantier.pricingPage.seo" });

  return {
    // The translated title already carries the brand — `absolute` stops the
    // root layout template from appending a second "| Cantaia".
    title: { absolute: t("title") },
    description: t("description"),
    alternates: {
      canonical: `https://cantaia.io/${locale}/pricing`,
      languages: {
        fr: "https://cantaia.io/fr/pricing",
        en: "https://cantaia.io/en/pricing",
        de: "https://cantaia.io/de/pricing",
        "x-default": "https://cantaia.io/fr/pricing",
      },
    },
  };
}

/** Rows of the "what an action costs" grid — action_type → i18n label key. */
const COST_ROWS = [
  { action: "chat_message", key: "cost1" },
  { action: "email_reply", key: "cost2" },
  { action: "task_extract", key: "cost3" },
  { action: "submission_parse", key: "cost4" },
  { action: "estimate_budget", key: "cost5" },
  { action: "pv_generate", key: "cost6" },
  { action: "plan_analyze", key: "cost7" },
  { action: "planning_generate", key: "cost8" },
] as const;

const PACK_KEYS: Record<string, string> = {
  discovery: "discovery",
  standard: "standard",
  plus: "plus",
  enterprise: "enterprise",
};

const PLAN_FEATURE_COUNT: Record<string, number> = {
  starter: 5,
  pro: 6,
  enterprise: 6,
};

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chantier.pricingPage" });
  const tSol = await getTranslations({ locale, namespace: "chantier.solutionsPage" });
  const credits = SIGNUP_BONUS_CREDITS;

  const solutionLinks = [
    { href: "/solutions/soumissions-cfc", name: tSol("index.s1Name") },
    { href: "/solutions/pv-chantier", name: tSol("index.s2Name") },
    { href: "/solutions/planning-chantier", name: tSol("index.s3Name") },
    { href: "/solutions/rapports-chantier", name: tSol("index.s4Name") },
  ];
  const nf = new Intl.NumberFormat(locale === "de" ? "de-CH" : locale === "en" ? "en-CH" : "fr-CH");

  const allPrices = [
    ...CREDIT_PACK_LIST.map((p) => p.priceCHF),
    ...CREDIT_PLAN_LIST.map((p) => p.priceCHF),
  ];

  const faqItems = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4", { credits }) },
    { q: t("faq.q5"), a: t("faq.a5") },
    { q: t("faq.q6"), a: t("faq.a6") },
    { q: t("faq.q7"), a: t("faq.a7") },
  ];

  const pricingJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: "Cantaia",
        description:
          "AI-powered construction management: email triage, CFC tenders, meeting minutes, schedules, field portal, AI chat. Metered in credits.",
        brand: { "@type": "Brand", name: "Cantaia" },
        offers: {
          "@type": "AggregateOffer",
          url: `https://cantaia.io/${locale}/pricing`,
          priceCurrency: "CHF",
          lowPrice: String(Math.min(...allPrices)),
          highPrice: String(Math.max(...allPrices)),
          offerCount: String(allPrices.length),
          availability: "https://schema.org/InStock",
          offers: [
            ...CREDIT_PACK_LIST.map((pack) => ({
              "@type": "Offer",
              name: `${pack.credits} credits`,
              price: String(pack.priceCHF),
              priceCurrency: "CHF",
              category: "one-time",
            })),
            ...CREDIT_PLAN_LIST.map((plan) => ({
              "@type": "Offer",
              name: plan.id,
              price: String(plan.priceCHF),
              priceCurrency: "CHF",
              category: "subscription",
            })),
          ],
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0A0C] text-[#FAFAFA]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <RegMarks blink={false} />

      <div className="pointer-events-none fixed left-8 top-20 z-20 hidden font-tech text-[10px] tracking-[0.18em] text-[#A1A1AA] xl:block">
        {t("coordTag")}
      </div>

      {/* ==== HERO ==== */}
      <section className="relative px-6 pb-16 pt-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-6 flex items-center gap-3">
            <div className="h-[1px] w-12 bg-[#F97316]" />
            <span className="font-tech text-[11px] font-bold tracking-[0.3em] text-[#F97316]">
              {t("hero.sectionMarker")}
            </span>
          </div>

          <h1
            className="font-condensed font-900 uppercase leading-[0.94] tracking-[-0.02em] text-[#FAFAFA]"
            style={{ fontSize: "clamp(40px, 7vw, 92px)" }}
          >
            {t("hero.titleLine1")}
            <br />
            <span className="text-[#F97316]">{t("hero.titleLine2")}</span>
            <br />
            {t("hero.titleLine3")}
          </h1>

          <p className="mt-8 max-w-[680px] font-sans text-[16px] leading-relaxed text-[#A1A1AA]">
            {t("hero.description", { credits })}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#27272A] pt-6 font-tech text-[11px] tracking-[0.18em] text-[#A1A1AA]">
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

      {/* ==== 02 · THE COUNTER ==== */}
      <section className="relative bg-[#0F0F11] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeader
            step={t("model.sectionStep")}
            title={t("model.sectionTitle")}
            caption={t("model.sectionCaption")}
            className="mb-14"
          />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { title: t("model.b1Title"), desc: t("model.b1Desc", { credits }) },
              { title: t("model.b2Title"), desc: t("model.b2Desc") },
              { title: t("model.b3Title"), desc: t("model.b3Desc") },
            ].map((b, i) => (
              <div key={b.title} className="border-t-2 border-[#F97316] bg-[#18181B] p-6">
                <span className="font-condensed text-[13px] font-900 uppercase tracking-[0.2em] text-[#F97316]">
                  0{i + 1}
                </span>
                <h3 className="mt-3 font-condensed text-[22px] font-900 uppercase tracking-[0.01em] text-[#FAFAFA]">
                  {b.title}
                </h3>
                <p className="mt-3 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">{b.desc}</p>
              </div>
            ))}
          </div>

          {/* Cost grid */}
          <div className="mt-14 border border-[#27272A] bg-[#0A0A0C]">
            <div className="border-b border-[#27272A] px-6 py-4">
              <h3 className="font-condensed text-[16px] font-800 uppercase tracking-[0.18em] text-[#FAFAFA]">
                {t("model.costTitle")}
              </h3>
              <p className="mt-1.5 font-sans text-[13px] text-[#A1A1AA]">{t("model.costCaption")}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse">
                <thead>
                  <tr className="border-b border-[#27272A]">
                    <th className="px-6 py-3 text-left font-tech text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
                      {t("model.costColAction")}
                    </th>
                    <th className="px-6 py-3 text-right font-tech text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
                      {t("model.costColCredits")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COST_ROWS.map((row) => (
                    <tr key={row.action} className="border-b border-[#27272A]/70">
                      <td className="px-6 py-3 font-sans text-[14px] text-[#D4D4D8]">
                        {t(`model.${row.key}`)}
                      </td>
                      <td className="px-6 py-3 text-right font-condensed text-[18px] font-800 tabular-nums text-[#F97316]">
                        {creditCostFor(row.action)}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-6 py-3 font-sans text-[14px] text-[#D4D4D8]">
                      {t("model.costFree")}
                    </td>
                    <td className="px-6 py-3 text-right font-tech text-[11px] uppercase tracking-[0.16em] text-[#22C55E]">
                      {t("model.costFreeValue")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <Hazard height="h-[22px]" />

      {/* ==== 03 · PACKS ==== */}
      <section className="relative bg-[#09090B] px-6 py-24 sm:px-10 lg:px-16">
        <SiteStamp
          number={String(CREDIT_PACK_LIST[0]?.priceCHF ?? 19)}
          subtitle={t("stamp.subtitle")}
          className="pointer-events-none absolute -right-6 top-20 hidden opacity-30 lg:block"
        />

        <div className="relative mx-auto max-w-[1400px]">
          <SectionHeader
            step={t("packs.sectionStep")}
            title={t("packs.sectionTitle")}
            caption={t("packs.sectionCaption")}
            className="mb-14"
          />

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CREDIT_PACK_LIST.map((pack) => {
              const key = PACK_KEYS[pack.id] ?? "discovery";
              const best = pack.id === BEST_PRICE_PACK_ID;
              return (
                <article
                  key={pack.id}
                  className={`relative flex flex-col border bg-[#0A0A0C] ${
                    best ? "border-[#F97316]" : "border-[#27272A]"
                  }`}
                >
                  <SitePlacard
                    lot={`${nf.format(pack.credits)}`}
                    title={t(`packs.${key}.name`)}
                    cfc={`${t("packs.priceCurrency")} ${pack.priceCHF}`}
                  />
                  <div className="flex flex-1 flex-col px-5 py-6">
                    <div className="font-tech text-[11px] uppercase tracking-[0.18em] text-[#A1A1AA]">
                      {t(`packs.${key}.tagline`)}
                    </div>

                    <div className="mt-5 flex items-baseline gap-2">
                      <span className="font-condensed text-[52px] font-900 leading-none tabular-nums text-[#FAFAFA]">
                        {pack.priceCHF}
                      </span>
                      <span className="font-tech text-[12px] tracking-[0.08em] text-[#A1A1AA]">
                        {t("packs.priceCurrency")}
                      </span>
                    </div>
                    <div className="mt-1 font-tech text-[10px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                      {t("packs.oneShot")}
                    </div>

                    <div className="mt-6 border-y border-dashed border-[#27272A] py-4">
                      <div className="font-condensed text-[26px] font-900 tabular-nums text-[#F97316]">
                        {nf.format(pack.credits)}
                      </div>
                      <div className="font-tech text-[10px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                        {t("packs.creditsLabel")}
                      </div>
                      <div className="mt-3 font-tech text-[11px] tabular-nums text-[#A1A1AA]">
                        {pack.pricePerCredit.toFixed(3)} {t("packs.perCreditLabel")}
                      </div>
                    </div>

                    <div className="mt-4 font-tech text-[10px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                      {t("packs.validity")}
                    </div>

                    <div className="mt-6">
                      <ChantierButton
                        href="/register"
                        variant={best ? "primary" : "ghost"}
                        className="w-full justify-center"
                      >
                        {t("packs.cta")}
                      </ChantierButton>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <Hazard />

      {/* ==== 04 · SUBSCRIPTIONS ==== */}
      <section className="relative bg-[#0F0F11] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeader
            step={t("plans.sectionStep")}
            title={t("plans.sectionTitle")}
            caption={t("plans.sectionCaption")}
            className="mb-14"
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {CREDIT_PLAN_LIST.map((plan) => {
              const highlight = plan.id === RECOMMENDED_PLAN_ID;
              const featureCount = PLAN_FEATURE_COUNT[plan.id] ?? 5;
              const features = Array.from({ length: featureCount }, (_, i) =>
                t(`plans.${plan.id}.feature${i + 1}`)
              );
              return (
                <article
                  key={plan.id}
                  className={`relative flex flex-col border bg-[#0A0A0C] ${
                    highlight
                      ? "border-[#F97316] shadow-[0_0_0_1px_#F97316_inset]"
                      : "border-[#27272A]"
                  }`}
                >
                  {highlight && (
                    <div className="absolute -top-[13px] left-8 bg-[#F97316] px-3 py-1 font-tech text-[10px] font-bold uppercase tracking-[0.22em] text-[#0A0A0C]">
                      {t("plans.recommended")}
                    </div>
                  )}

                  <SitePlacard
                    lot={t(`plans.${plan.id}.code`)}
                    title={t(`plans.${plan.id}.name`)}
                    cfc={`${t("plans.priceCurrency")} ${plan.priceCHF}`}
                  />

                  <div className="flex flex-1 flex-col px-6 py-8">
                    <div className="font-tech text-[11px] uppercase tracking-[0.2em] text-[#A1A1AA]">
                      {t(`plans.${plan.id}.tagline`)}
                    </div>

                    <div className="mt-6 flex items-baseline gap-2">
                      <span className="font-condensed text-[68px] font-900 leading-none tabular-nums text-[#FAFAFA]">
                        {plan.priceCHF}
                      </span>
                      <span className="font-tech text-[12px] tracking-[0.08em] text-[#A1A1AA]">
                        {t("plans.priceCurrency")}
                      </span>
                    </div>
                    <div className="mt-1 font-condensed text-[13px] font-600 uppercase tracking-[0.14em] text-[#A1A1AA]">
                      {t("plans.priceUnit")}
                    </div>

                    <div className="mt-6 border-y border-dashed border-[#27272A] py-4">
                      <div className="font-condensed text-[30px] font-900 tabular-nums text-[#F97316]">
                        {nf.format(plan.credits)}
                      </div>
                      <div className="font-tech text-[10px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                        {t("plans.creditsIncluded")}
                      </div>
                      <div className="mt-3 font-tech text-[11px] tabular-nums text-[#A1A1AA]">
                        {plan.pricePerCredit.toFixed(3)} {t("plans.perCreditLabel")}
                      </div>
                    </div>

                    <ul className="mt-6 flex-1 space-y-3">
                      {features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-3 font-sans text-[14px] leading-relaxed text-[#D4D4D8]"
                        >
                          <span
                            className={`mt-[6px] h-[8px] w-[8px] flex-shrink-0 ${
                              highlight ? "bg-[#F97316]" : "bg-[#3F3F46]"
                            }`}
                            aria-hidden
                          />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8">
                      <ChantierButton
                        href={plan.id === "enterprise" ? "mailto:contact@cantaia.io" : "/register"}
                        variant={highlight ? "primary" : "ghost"}
                        className="w-full justify-center"
                      >
                        {t(`plans.${plan.id}.ctaLabel`)}
                      </ChantierButton>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-12 border border-[#27272A] bg-[#111114] p-6 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-tech text-[11px] font-bold uppercase tracking-[0.2em] text-[#F97316]">
                {t("plans.note.label")}
              </span>
              <span className="font-tech text-[10px] tracking-[0.18em] text-[#A1A1AA]">
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

      {/* ==== 05 · CHF PER CREDIT ==== */}
      <section className="relative bg-[#0A0A0C] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeader
            step={t("compare.sectionStep")}
            title={t("compare.sectionTitle")}
            caption={t("compare.sectionCaption")}
            className="mb-12"
          />

          <div className="overflow-x-auto border border-[#27272A]">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-[#27272A] bg-[#111114]">
                  <th className="px-5 py-3 text-left font-tech text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
                    {t("compare.colMode")}
                  </th>
                  <th className="px-5 py-3 text-right font-tech text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
                    {t("compare.colPrice")}
                  </th>
                  <th className="px-5 py-3 text-right font-tech text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
                    {t("compare.colCredits")}
                  </th>
                  <th className="px-5 py-3 text-right font-tech text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
                    {t("compare.colPerCredit")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {CREDIT_PACK_LIST.map((pack) => (
                  <tr key={`pack-${pack.id}`} className="border-b border-[#27272A]/70">
                    <td className="px-5 py-3 font-sans text-[14px] text-[#D4D4D8]">
                      {t("compare.rowPackLabel")} · {t(`packs.${PACK_KEYS[pack.id] ?? "discovery"}.name`)}
                    </td>
                    <td className="px-5 py-3 text-right font-tech text-[13px] tabular-nums text-[#A1A1AA]">
                      {pack.priceCHF}
                    </td>
                    <td className="px-5 py-3 text-right font-tech text-[13px] tabular-nums text-[#A1A1AA]">
                      {nf.format(pack.credits)}
                    </td>
                    <td className="px-5 py-3 text-right font-tech text-[13px] tabular-nums text-[#FAFAFA]">
                      {pack.pricePerCredit.toFixed(3)}
                    </td>
                  </tr>
                ))}
                {CREDIT_PLAN_LIST.map((plan) => {
                  const best = plan.id === CREDIT_PLAN_LIST[CREDIT_PLAN_LIST.length - 1]?.id;
                  return (
                    <tr
                      key={`plan-${plan.id}`}
                      className={`border-b border-[#27272A]/70 ${best ? "bg-[#F97316]/[0.06]" : ""}`}
                    >
                      <td className="px-5 py-3 font-sans text-[14px] text-[#D4D4D8]">
                        {t("compare.rowSubLabel")} · {t(`plans.${plan.id}.name`)}
                        {best && (
                          <span className="ml-3 inline-block border border-[#F97316] px-1.5 py-[1px] font-tech text-[9px] uppercase tracking-[0.14em] text-[#F97316]">
                            {t("compare.bestValue")}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-tech text-[13px] tabular-nums text-[#A1A1AA]">
                        {plan.priceCHF}
                      </td>
                      <td className="px-5 py-3 text-right font-tech text-[13px] tabular-nums text-[#A1A1AA]">
                        {nf.format(plan.credits)}
                      </td>
                      <td className="px-5 py-3 text-right font-tech text-[13px] tabular-nums text-[#F97316]">
                        {plan.pricePerCredit.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-5 max-w-[760px] font-sans text-[13px] leading-relaxed text-[#A1A1AA]">
            {t("compare.footnote")}
          </p>
        </div>
      </section>

      <Hazard />

      {/* ==== 06 · FAQ ==== */}
      <section className="bg-[#0F0F11] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeader
            step={t("faq.sectionStep")}
            title={t("faq.sectionTitle")}
            caption={t("faq.sectionCaption")}
            className="mb-12"
          />

          <div className="grid grid-cols-1 gap-px bg-[#27272A] md:grid-cols-2">
            {faqItems.map((item) => (
              <div key={item.q} className="bg-[#0F0F11] p-6">
                <h3 className="font-condensed text-[21px] font-800 uppercase leading-tight tracking-[-0.005em] text-[#FAFAFA]">
                  {item.q}
                </h3>
                <p className="mt-3 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Hazard height="h-[22px]" />

      {/* ==== INTERNAL LINKING · SOLUTIONS ==== */}
      <section className="bg-[#0A0A0C] px-6 py-14 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <h2 className="font-condensed text-[14px] font-800 uppercase tracking-[0.2em] text-[#A1A1AA]">
            {tSol("common.relatedTitle")}
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-px bg-[#27272A] sm:grid-cols-2 lg:grid-cols-4">
            {solutionLinks.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="group flex min-h-[64px] items-center justify-between gap-3 bg-[#0A0A0C] px-5 py-4 transition-colors hover:bg-[#111114]"
              >
                <span className="font-condensed text-[16px] font-800 uppercase tracking-[0.02em] text-[#FAFAFA] group-hover:text-[#F97316]">
                  {s.name}
                </span>
                <span className="font-tech text-[12px] text-[#F97316]" aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ==== FINAL CTA ==== */}
      <section className="relative bg-[#09090B] px-6 py-28 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1100px] text-center">
          <div className="inline-flex items-center gap-3 border border-[#F97316]/40 bg-[#0A0A0C] px-4 py-2">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F97316]" />
            <span className="font-tech text-[11px] font-bold tracking-[0.3em] text-[#F97316]">
              {t("finalCta.badge")}
            </span>
          </div>

          <h2
            className="mt-8 font-condensed font-900 uppercase leading-[0.94] tracking-[-0.02em] text-[#FAFAFA]"
            style={{ fontSize: "clamp(36px, 6.5vw, 84px)" }}
          >
            {t("finalCta.titleLine1")}
            <br />
            <span className="text-[#F97316]">{t("finalCta.titleLine2", { credits })}</span>
          </h2>

          <p className="mx-auto mt-8 max-w-[600px] font-sans text-[16px] leading-relaxed text-[#A1A1AA]">
            {t("finalCta.description")}
          </p>

          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <ChantierButton href="/register" variant="primary">
              {t("finalCta.ctaPrimary")}
            </ChantierButton>
            <ChantierButton href="/solutions" variant="ghost">
              {tSol("index.sectionMarker")}
            </ChantierButton>
          </div>
        </div>
      </section>
    </main>
  );
}
