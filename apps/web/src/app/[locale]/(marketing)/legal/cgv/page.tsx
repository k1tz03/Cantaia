import type { Metadata } from "next";
import { useTranslations } from "next-intl";

const cgvSeo: Record<string, { title: string; description: string }> = {
  fr: {
    title: "Conditions Générales de Vente (CGV)",
    description:
      "Conditions générales de vente de Cantaia, logiciel SaaS de gestion de chantier IA en Suisse.",
  },
  en: {
    title: "Terms of Sale",
    description:
      "Terms of sale for Cantaia, the AI construction management SaaS for Switzerland.",
  },
  de: {
    title: "Allgemeine Geschäftsbedingungen (AGB)",
    description:
      "Allgemeine Geschäftsbedingungen von Cantaia, der KI-gestützten Baumanagement-SaaS für die Schweiz.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const seo = cgvSeo[locale] || cgvSeo.fr;

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: `https://cantaia.io/${locale}/legal/cgv`,
      languages: {
        fr: "https://cantaia.io/fr/legal/cgv",
        en: "https://cantaia.io/en/legal/cgv",
        de: "https://cantaia.io/de/legal/cgv",
      },
    },
  };
}

export default function CGVPage() {
  const t = useTranslations("legal");

  return (
    <section className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
      <h1 className="text-3xl font-bold tracking-tight text-[#FAFAFA] sm:text-4xl">
        {t("cgv.title")}
      </h1>
      <p className="mt-4 text-sm text-[#71717A]">{t("cgv.lastUpdated")}</p>

      <div className="mt-10 space-y-8 text-[#A1A1AA]">
        {(["scope", "subscriptions", "payment", "termination", "liability", "jurisdiction"] as const).map(
          (section) => (
            <div key={section}>
              <h2 className="text-lg font-semibold text-[#FAFAFA]">
                {t(`cgv.${section}Title`)}
              </h2>
              <p className="mt-2 leading-relaxed">
                {t(`cgv.${section}Content`)}
              </p>
            </div>
          )
        )}
      </div>
    </section>
  );
}
