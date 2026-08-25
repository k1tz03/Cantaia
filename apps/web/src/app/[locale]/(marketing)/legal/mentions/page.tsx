import type { Metadata } from "next";
import { useTranslations } from "next-intl";

const mentionsSeo: Record<string, { title: string; description: string }> = {
  fr: {
    title: "Mentions Légales",
    description:
      "Mentions légales de Cantaia, éditeur du logiciel de gestion de chantier IA Cantaia.",
  },
  en: {
    title: "Legal Notice",
    description:
      "Legal notice of Cantaia, publisher of the Cantaia AI construction management software.",
  },
  de: {
    title: "Impressum",
    description:
      "Impressum von Cantaia, Herausgeber der KI-Baumanagement-Software Cantaia.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const seo = mentionsSeo[locale] || mentionsSeo.fr;

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: `https://cantaia.io/${locale}/legal/mentions`,
      languages: {
        fr: "https://cantaia.io/fr/legal/mentions",
        en: "https://cantaia.io/en/legal/mentions",
        de: "https://cantaia.io/de/legal/mentions",
        "x-default": "https://cantaia.io/fr/legal/mentions",
      },
    },
  };
}

export default function MentionsPage() {
  const t = useTranslations("legal");

  return (
    <section className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
      <h1 className="text-3xl font-bold tracking-tight text-[#FAFAFA] sm:text-4xl">
        {t("mentions.title")}
      </h1>
      <p className="mt-4 text-sm text-[#A1A1AA]">
        {t("mentions.lastUpdated")}
      </p>

      <div className="mt-10 space-y-8 text-[#A1A1AA]">
        {(["editor", "hosting", "intellectual", "credits"] as const).map(
          (section) => (
            <div key={section}>
              <h2 className="text-lg font-semibold text-[#FAFAFA]">
                {t(`mentions.${section}Title`)}
              </h2>
              <p className="mt-2 leading-relaxed">
                {t(`mentions.${section}Content`)}
              </p>
            </div>
          )
        )}
      </div>
    </section>
  );
}
