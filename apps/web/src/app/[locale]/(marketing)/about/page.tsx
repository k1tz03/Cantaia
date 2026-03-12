import type { Metadata } from "next";

const aboutSeo: Record<string, { title: string; description: string }> = {
  fr: {
    title: "A propos de Cantaia — Logiciel IA pour le chantier suisse",
    description:
      "Cantaia est un logiciel SaaS de gestion de chantier augmenté par IA, conçu par un chef de projet construction pour les professionnels du bâtiment en Suisse.",
  },
  en: {
    title: "About Cantaia — AI Software for Swiss Construction",
    description:
      "Cantaia is an AI-powered construction management SaaS built by a construction project manager for building professionals in Switzerland.",
  },
  de: {
    title: "Über Cantaia — KI-Software für Schweizer Baustellen",
    description:
      "Cantaia ist eine KI-gestützte Baumanagement-SaaS, entwickelt von einem Bauprojektleiter für Bauprofis in der Schweiz.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const seo = aboutSeo[locale] || aboutSeo.fr;

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: `https://cantaia.ch/${locale}/about`,
      languages: {
        fr: "https://cantaia.ch/fr/about",
        en: "https://cantaia.ch/en/about",
        de: "https://cantaia.ch/de/about",
      },
    },
  };
}

export default function AboutPage() {
  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-24">
      <h1 className="text-3xl font-bold text-slate-900">
        Cantaia
      </h1>
      <p className="mt-4 max-w-2xl text-center text-slate-600">
        AI assistant for construction project managers in Switzerland.
      </p>
    </main>
  );
}
