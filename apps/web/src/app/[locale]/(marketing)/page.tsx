import type { Metadata } from "next";
import LandingChantier from "@/components/chantier/LandingChantier";
import { CREDIT_PACK_LIST, CREDIT_PLAN_LIST } from "@/components/credits/credit-config";

const homeSeo: Record<string, { title: string; description: string; keywords: string[] }> = {
  fr: {
    // `absolute` below: the title already carries the brand, so the root layout
    // template ("%s | Cantaia") must not append it a second time.
    title: "Cantaia — Logiciel de gestion de chantier IA pour la Suisse",
    description:
      "Triage IA des emails Outlook, soumissions CFC comparées, PV de chantier et planning. Crédits offerts à l'inscription, sans carte bancaire.",
    keywords: [
      "gestion de chantier",
      "logiciel construction suisse",
      "IA construction",
      "soumission CFC",
      "PV de chantier",
      "chef de projet construction",
      "triage email chantier",
      "planning de chantier",
      "rapport journalier chantier",
      "Cantaia",
      "SIA 118",
      "normes suisses construction",
    ],
  },
  en: {
    title: "Cantaia — AI Construction Management Software for Switzerland",
    description:
      "AI Outlook email triage, CFC tenders compared, site meeting minutes and schedules. Free credits on sign-up, no credit card required.",
    keywords: [
      "construction management software",
      "AI construction",
      "Swiss construction",
      "CFC tenders",
      "site meeting minutes",
      "construction project manager",
      "email triage",
      "construction schedule",
      "daily site report",
      "Cantaia",
    ],
  },
  de: {
    title: "Cantaia — KI-Bausoftware für Schweizer Bauleiter",
    description:
      "KI-Sortierung der Outlook-Mails, Submissionen vergleichen, Bauprotokolle und Bauzeitenplan. Startguthaben geschenkt, ohne Kreditkarte.",
    keywords: [
      "Bausoftware Schweiz",
      "Baumanagement Software",
      "KI Baustelle",
      "Submission BKP",
      "Devisierung NPK",
      "Bauprotokoll",
      "Bauzeitenplan",
      "Bautagebuch",
      "Rapportwesen",
      "Bauführer",
      "Cantaia",
    ],
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const seo = homeSeo[locale] || homeSeo.fr;

  return {
    title: { absolute: seo.title },
    description: seo.description,
    keywords: seo.keywords,
    alternates: {
      canonical: `https://cantaia.io/${locale}`,
      languages: {
        fr: "https://cantaia.io/fr",
        en: "https://cantaia.io/en",
        de: "https://cantaia.io/de",
        "x-default": "https://cantaia.io/fr",
      },
    },
  };
}

// Price range advertised in structured data — derived from the shared credit
// config so a pricing change can never leave a stale number in the markup.
const ALL_PRICES = [
  ...CREDIT_PACK_LIST.map((p) => p.priceCHF),
  ...CREDIT_PLAN_LIST.map((p) => p.priceCHF),
];
const LOW_PRICE = Math.min(...ALL_PRICES);
const HIGH_PRICE = Math.max(...ALL_PRICES);

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://cantaia.io/#organization",
      name: "Cantaia",
      url: "https://cantaia.io",
      logo: {
        "@type": "ImageObject",
        // Dynamic opengraph-image route — /og-image.png does not exist (404)
        url: "https://cantaia.io/opengraph-image",
        width: 1200,
        height: 630,
      },
      description: "AI-powered construction management SaaS for Swiss project managers",
      address: {
        "@type": "PostalAddress",
        addressCountry: "CH",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://cantaia.io/#software",
      name: "Cantaia",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "AI-powered construction project management: email triage, CFC tenders, site meeting minutes, schedules, drawings and daily site reports.",
      url: "https://cantaia.io",
      inLanguage: ["fr-CH", "de-CH", "en"],
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "CHF",
        lowPrice: String(LOW_PRICE),
        highPrice: String(HIGH_PRICE),
        offerCount: String(ALL_PRICES.length),
        availability: "https://schema.org/InStock",
        url: "https://cantaia.io/fr/pricing",
      },
    },
    {
      "@type": "WebSite",
      "@id": "https://cantaia.io/#website",
      url: "https://cantaia.io",
      name: "Cantaia",
      publisher: { "@id": "https://cantaia.io/#organization" },
      inLanguage: ["fr-CH", "en", "de-CH"],
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingChantier />
    </>
  );
}
