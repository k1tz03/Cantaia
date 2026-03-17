import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const pricingSeo: Record<string, { title: string; description: string }> = {
  fr: {
    title: "Tarifs Cantaia — 99 CHF/mois, tout inclus",
    description:
      "Un seul plan à 99 CHF/mois. Triage email IA, PV automatiques, soumissions CFC, estimation de prix, gestion des plans. Essai gratuit 14 jours, sans engagement.",
  },
  en: {
    title: "Cantaia Pricing — CHF 99/month, all inclusive",
    description:
      "One plan at CHF 99/month. AI email triage, automatic meeting minutes, CFC submissions, price estimation, plan management. Free 14-day trial, no commitment.",
  },
  de: {
    title: "Cantaia Preise — CHF 99/Monat, alles inklusive",
    description:
      "Ein Plan für CHF 99/Monat. KI-E-Mail-Triage, automatische Sitzungsprotokolle, CFC-Ausschreibungen, Preisschätzung, Planverwaltung. 14 Tage kostenlos testen.",
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
      canonical: `https://cantaia.ch/${locale}/pricing`,
      languages: {
        fr: "https://cantaia.ch/fr/pricing",
        en: "https://cantaia.ch/en/pricing",
        de: "https://cantaia.ch/de/pricing",
      },
    },
  };
}

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Cantaia Fondateur",
  description:
    "AI-powered construction management: email triage, meeting minutes, CFC submissions, price estimation, plan management.",
  brand: { "@type": "Brand", name: "Cantaia" },
  offers: {
    "@type": "Offer",
    url: "https://cantaia.ch/fr/pricing",
    priceCurrency: "CHF",
    price: "99",
    priceValidUntil: "2027-01-01",
    availability: "https://schema.org/InStock",
    description: "Plan Fondateur — tout inclus, prix bloqué 12 mois",
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

      <h1 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-4 text-lg text-slate-500">{t("subtitle")}</p>

      <div className="mt-16 grid w-full max-w-5xl grid-cols-1 gap-8 sm:grid-cols-3">
        {PLANS.map(({ key, featuresKeys, highlight }) => {
          const nameKey = `${key}Name` as const;
          const descKey = `${key}Desc` as const;
          const priceKey = `${key}Price` as const;
          const isEnterprise = key === "enterprise";

          return (
            <div
              key={key}
              className={`relative rounded-2xl border bg-white p-8 shadow-sm transition-shadow duration-200 hover:shadow-lg ${
                highlight
                  ? "border-[#2563EB] border-2 shadow-md"
                  : "border-slate-200"
              }`}
            >
              {highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#2563EB] px-4 py-1 text-xs font-semibold text-white">
                  {t("popular")}
                </div>
              )}

              <h3 className="text-lg font-semibold text-slate-900">
                {t(nameKey)}
              </h3>
              <p className="mt-2 text-sm text-slate-500">{t(descKey)}</p>

              <p className="mt-6 text-3xl font-bold text-slate-900">
                {isEnterprise ? (
                  <span className="text-2xl">{t("customPrice")}</span>
                ) : (
                  <>
                    {t("currency")} {t(priceKey)}
                    <span className="text-sm font-normal text-slate-500">
                      {t("perMonth")}
                    </span>
                  </>
                )}
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
                    <span className="text-slate-700">
                      {t(`${key}Features.${fk}`)}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={isEnterprise ? "mailto:contact@cantaia.ch" : "/register"}
                className={`mt-8 block w-full rounded-lg py-3 text-center text-sm font-semibold transition-all duration-200 ${
                  highlight
                    ? "bg-[#2563EB] text-white shadow-lg shadow-blue-500/25 hover:bg-[#1D4ED8]"
                    : "border border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {isEnterprise ? t("contactUs") : t("choosePlan")}
              </Link>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-sm text-slate-500">
        {t("noCommitment")}
      </p>
    </main>
  );
}
