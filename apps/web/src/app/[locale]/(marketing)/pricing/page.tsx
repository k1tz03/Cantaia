import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Check } from "lucide-react";

const pricingSeo: Record<string, { title: string; description: string }> = {
  fr: {
    title: "Tarifs Cantaia — Plans de 49 a 119 CHF/utilisateur/mois",
    description:
      "3 plans par utilisateur : Starter (49 CHF), Pro (89 CHF), Enterprise (119 CHF). Mail IA, soumissions, PV, planning, portail terrain, chat IA. Essai gratuit 14 jours.",
  },
  en: {
    title: "Cantaia Pricing — Plans from CHF 49 to 119/user/month",
    description:
      "3 per-user plans: Starter (CHF 49), Pro (CHF 89), Enterprise (CHF 119). AI Mail, submissions, meeting minutes, planning, field portal, AI chat. Free 14-day trial.",
  },
  de: {
    title: "Cantaia Preise — Plane von CHF 49 bis 119/Benutzer/Monat",
    description:
      "3 Plane pro Benutzer: Starter (CHF 49), Pro (CHF 89), Enterprise (CHF 119). KI-Mail, Submissionen, Protokolle, Planung, Baustellenportal, KI-Chat. 14 Tage kostenlos.",
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

const PLANS = [
  {
    key: "starter" as const,
    price: 49,
    featuresKeys: [
      "users",
      "projects",
      "mail",
      "chat",
      "briefing",
      "tasks",
      "suppliers",
      "emailSupport",
    ],
    highlight: false,
  },
  {
    key: "pro" as const,
    price: 89,
    featuresKeys: [
      "allStarter",
      "submissions",
      "pv",
      "planning",
      "portal",
      "plans",
      "visits",
      "reports",
      "chat1000",
      "prioritySupport",
    ],
    highlight: true,
  },
  {
    key: "enterprise" as const,
    price: 119,
    featuresKeys: [
      "allPro",
      "direction",
      "dataIntel",
      "branding",
      "api",
      "chatUnlimited",
      "multiOrg",
      "dedicatedSupport",
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
        {PLANS.map(({ key, price, featuresKeys, highlight }) => {
          const nameKey = `${key}Name` as const;
          const descKey = `${key}Desc` as const;
          const minKey = `${key}Min` as const;
          const isEnterprise = key === "enterprise";

          return (
            <div
              key={key}
              className={`relative rounded-2xl border bg-[#18181B] p-8 shadow-sm transition-shadow duration-200 hover:shadow-lg ${
                highlight
                  ? "border-[#F97316] border-2 shadow-md shadow-[#F97316]/10"
                  : "border-[#27272A]"
              }`}
            >
              {highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-4 py-1 text-xs font-semibold text-white">
                  {t("popular")}
                </div>
              )}

              <h3 className="text-lg font-semibold text-[#FAFAFA]">
                {t(nameKey)}
              </h3>
              <p className="mt-2 text-sm text-[#A1A1AA]">{t(descKey)}</p>

              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-[#FAFAFA]">
                  {t("currency")} {price}
                </span>
                <span className="text-sm text-[#A1A1AA]">
                  /{t("perUser")}
                </span>
              </p>
              <p className="mt-1 text-xs text-[#52525B]">{t(minKey)}</p>

              <ul className="mt-8 space-y-3">
                {featuresKeys.map((fk) => (
                  <li key={fk} className="flex items-start gap-3 text-sm">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22C55E]/10 flex-shrink-0 mt-0.5">
                      <Check className="h-3.5 w-3.5 text-[#22C55E]" />
                    </div>
                    <span className="text-[#A1A1AA]">
                      {t(`${key}Features.${fk}`)}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={isEnterprise ? "mailto:contact@cantaia.io" : "/register"}
                className={`mt-8 block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all duration-200 ${
                  highlight
                    ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white shadow-lg shadow-[#F97316]/25 hover:shadow-xl hover:shadow-[#F97316]/30"
                    : "border border-[#27272A] bg-[#18181B] text-[#FAFAFA] hover:border-[#3F3F46] hover:bg-[#27272A]"
                }`}
              >
                {isEnterprise ? t("contactUs") : t("startTrial")}
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
