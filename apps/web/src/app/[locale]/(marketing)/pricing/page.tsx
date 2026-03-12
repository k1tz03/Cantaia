import type { Metadata } from "next";
import { useTranslations } from "next-intl";

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
  description: "AI-powered construction management: email triage, meeting minutes, CFC submissions, price estimation, plan management.",
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

export default function PricingPage() {
  const t = useTranslations("pricing");

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <h1 className="text-3xl font-bold text-slate-900">
        {t("title")}
      </h1>
      <p className="mt-4 text-slate-500">{t("trial")}</p>
      <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
        {(["starter", "pro", "enterprise"] as const).map((plan) => (
          <div
            key={plan}
            className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            <h3 className="text-lg font-semibold text-slate-900">
              {t(`${plan}.name`)}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {t(`${plan}.description`)}
            </p>
            <p className="mt-4 text-3xl font-bold text-brand">
              CHF {t(`${plan}.price`)}
              <span className="text-sm font-normal text-slate-500">
                /{t("monthly")}
              </span>
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
