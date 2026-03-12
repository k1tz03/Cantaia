import type { Metadata } from "next";
import { useTranslations } from "next-intl";

export const metadata: Metadata = {
  title: "Mentions Legales",
  description: "Mentions legales de Cantaia SA, editeur du logiciel de gestion de chantier IA Cantaia.",
  alternates: {
    canonical: "https://cantaia.ch/fr/legal/mentions",
    languages: { fr: "https://cantaia.ch/fr/legal/mentions", en: "https://cantaia.ch/en/legal/mentions", de: "https://cantaia.ch/de/legal/mentions" },
  },
};

export default function MentionsPage() {
  const t = useTranslations("legal");

  return (
    <section className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {t("mentions.title")}
      </h1>
      <p className="mt-4 text-sm text-slate-500">
        {t("mentions.lastUpdated")}
      </p>

      <div className="mt-10 space-y-8 text-slate-600">
        {(["editor", "hosting", "intellectual", "credits"] as const).map(
          (section) => (
            <div key={section}>
              <h2 className="text-lg font-semibold text-slate-800">
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
