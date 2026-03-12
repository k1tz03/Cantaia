import type { Metadata } from "next";
import { useTranslations } from "next-intl";

export const metadata: Metadata = {
  title: "Conditions Generales de Vente (CGV)",
  description: "Conditions generales de vente de Cantaia, logiciel SaaS de gestion de chantier IA en Suisse.",
  alternates: {
    canonical: "https://cantaia.ch/fr/legal/cgv",
    languages: { fr: "https://cantaia.ch/fr/legal/cgv", en: "https://cantaia.ch/en/legal/cgv", de: "https://cantaia.ch/de/legal/cgv" },
  },
};

export default function CGVPage() {
  const t = useTranslations("legal");

  return (
    <section className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {t("cgv.title")}
      </h1>
      <p className="mt-4 text-sm text-slate-500">{t("cgv.lastUpdated")}</p>

      <div className="mt-10 space-y-8 text-slate-600">
        {(["scope", "subscriptions", "payment", "termination", "liability", "jurisdiction"] as const).map(
          (section) => (
            <div key={section}>
              <h2 className="text-lg font-semibold text-slate-800">
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
