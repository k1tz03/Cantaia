import type { Metadata } from "next";
import LandingChantier from "@/components/chantier/LandingChantier";

const homeSeo: Record<string, { title: string; description: string; keywords: string[] }> = {
  fr: {
    title: "Cantaia — Logiciel de gestion de chantier IA pour la Suisse",
    description:
      "Cantaia automatise la gestion de chantier : triage email Outlook par IA, PV de séance automatiques, soumissions CFC, estimation de prix, gestion des plans. Essai gratuit 14 jours.",
    keywords: [
      "gestion de chantier", "logiciel construction suisse", "IA construction", "soumission CFC",
      "PV de séance", "chef de projet construction", "triage email chantier", "estimation prix construction",
      "gestion plans chantier", "Cantaia", "SIA", "normes suisses construction",
    ],
  },
  en: {
    title: "Cantaia — AI Construction Project Management Software for Switzerland",
    description:
      "Cantaia automates construction management: AI Outlook email triage, automatic meeting minutes, CFC submissions, price estimation, plan management. Free 14-day trial.",
    keywords: [
      "construction management software", "AI construction", "Swiss construction", "CFC submissions",
      "meeting minutes", "construction project manager", "email triage", "price estimation",
      "plan management", "Cantaia",
    ],
  },
  de: {
    title: "Cantaia — KI-Bauprojektmanagement-Software für die Schweiz",
    description:
      "Cantaia automatisiert das Baumanagement: KI-Outlook-E-Mail-Triage, automatische Sitzungsprotokolle, CFC-Ausschreibungen, Preisschätzung, Planverwaltung. 14 Tage kostenlos testen.",
    keywords: [
      "Baumanagement-Software", "KI Baustelle", "Schweizer Bau", "CFC-Ausschreibungen",
      "Sitzungsprotokolle", "Bauprojektleiter", "E-Mail-Triage", "Preisschätzung",
      "Planverwaltung", "Cantaia",
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
    title: seo.title,
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
        url: "https://cantaia.io/og-image.png",
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
      description: "AI-powered construction project management: email triage, meeting minutes, CFC submissions, price estimation, plan management.",
      url: "https://cantaia.io",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "CHF",
        description: "14-day free trial",
        availability: "https://schema.org/InStock",
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
