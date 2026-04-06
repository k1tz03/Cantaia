import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const pricingSeo: Record<string, { title: string; description: string }> = {
  fr: {
    title: "Tarifs Cantaia — Plans dès 149 CHF/mois",
    description:
      "3 plans adaptés : Starter (149 CHF), Pro (349 CHF), Enterprise (790 CHF). Triage email IA, PV automatiques, soumissions CFC, estimation de prix, gestion des plans. Essai gratuit 14 jours.",
  },
  en: {
    title: "Cantaia Pricing — Plans from CHF 149/month",
    description:
      "3 tailored plans: Starter (CHF 149), Pro (CHF 349), Enterprise (CHF 790). AI email triage, automatic meeting minutes, CFC submissions, price estimation, plan management. Free 14-day trial.",
  },
  de: {
    title: "Cantaia Preise — Pläne ab CHF 149/Monat",
    description:
      "3 passende Pläne: Starter (CHF 149), Pro (CHF 349), Enterprise (CHF 790). KI-E-Mail-Triage, automatische Sitzungsprotokolle, CFC-Ausschreibungen, Preisschätzung, Planverwaltung. 14 Tage kostenlos.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const seo = pricingSeo[locale] || pricingSeo.fr;

  return {
    title: seo.title,
    description: seo.description,
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
    "AI-powered construction management: email triage, meeting minutes, CFC submissions, price estimation, plan management.",
  brand: { "@type": "Brand", name: "Cantaia" },
  offers: {
    "@type": "AggregateOffer",
    url: "https://cantaia.io/fr/pricing",
    priceCurrency: "CHF",
    lowPrice: "149",
    highPrice: "790",
    offerCount: "3",
    availability: "https://schema.org/InStock",
  },
};

const PLANS = [
  {
    key: "starter" as const,
    featuresKeys: [
      "users",
      "projects",
      "emailClassification",
      "basicPV",
      "tasks",
      "plans",
      "emailSupport",
    ],
    highlight: false,
  },
  {
    key: "pro" as const,
    featuresKeys: [
      "users",
      "projects",
      "emailClassification",
      "advancedPV",
      "dailyBriefing",
      "submissions",
      "intelligence",
      "visits",
      "archiving",
      "prioritySupport",
    ],
    highlight: true,
  },
  {
    key: "enterprise" as const,
    featuresKeys: [
      "users",
      "projects",
      "allProFeatures",
      "subdomain",
      "branding",
      "customIntegrations",
      "dedicatedSupport",
      "training",
    ],
    highlight: false,
  },
];

export default function PricingPage() {
  const t = useTranslations("landing.pricing");

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />

      <h1 className="font-display text-3xl font-bold text-[#FAFAFA] sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-4 text-lg text-[#A1A1AA]">{t("subtitle")}</p>

      <div className="mt-16 grid w-full max-w-5xl grid-cols-1 gap-8 sm:grid-cols-3">
        {PLANS.map(({ key, featuresKeys, highlight }) => {
          const nameKey = `${key}Name` as const;
          const descKey = `${key}Desc` as const;
          const priceKey = `${key}Price` as const;
          const isEnterprise = key === "enterprise";

          return (
            <div
              key={key}
              className={`relative rounded-2xl border bg-[#18181B] p-8 shadow-sm transition-shadow duration-200 hover:shadow-lg ${
                highlight
                  ? "border-[#2563EB] border-2 shadow-md"
                  : "border-[#27272A]"
              }`}
            >
              {highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#2563EB] px-4 py-1 text-xs font-semibold text-white">
                  {t("popular")}
                </div>
              )}

              <h3 className="text-lg font-semibold text-[#FAFAFA]">
                {t(nameKey)}
              </h3>
              <p className="mt-2 text-sm text-[#A1A1AA]">{t(descKey)}</p>

              <p className="mt-6 text-3xl font-bold text-[#FAFAFA]">
                <>
                  {t("currency")} {t(priceKey)}
                  <span className="text-sm font-normal text-[#A1A1AA]">
                    {t("perMonth")}
                  </span>
                </>
              </p>

              <ul className="mt-8 space-y-3">
                {featuresKeys.map((fk) => (
                  <li key={fk} className="flex items-start gap-3 text-sm">
                    <svg
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#10B981]"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-[#A1A1AA]">
                      {t(`${key}Features.${fk}`)}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={isEnterprise ? "mailto:contact@cantaia.io" : "/register"}
                className={`mt-8 block w-full rounded-lg py-3 text-center text-sm font-semibold transition-all duration-200 ${
                  highlight
                    ? "bg-[#2563EB] text-white shadow-lg shadow-blue-500/25 hover:bg-[#1D4ED8]"
                    : "border border-[#27272A] bg-[#18181B] text-[#FAFAFA] hover:border-[#3F3F46] hover:bg-[#27272A]"
                }`}
              >
                {isEnterprise ? t("contactUs") : t("choosePlan")}
              </Link>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-sm text-[#A1A1AA]">
        {t("noCommitment")}
      </p>
    </main>
  );
}
