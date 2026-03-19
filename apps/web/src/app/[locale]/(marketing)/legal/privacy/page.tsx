import type { Metadata } from "next";
import { useTranslations } from "next-intl";

export const metadata: Metadata = {
  title: "Politique de Confidentialite",
  description: "Politique de confidentialite de Cantaia. Hebergement europeen, chiffrement de bout en bout, conforme RGPD et droit suisse.",
  alternates: {
    canonical: "https://cantaia.io/fr/legal/privacy",
    languages: { fr: "https://cantaia.io/fr/legal/privacy", en: "https://cantaia.io/en/legal/privacy", de: "https://cantaia.io/de/legal/privacy" },
  },
};

export default function PrivacyPage() {
  const t = useTranslations("legal");

  return (
    <section className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {t("privacy.title")}
      </h1>
      <p className="mt-4 text-sm text-slate-500">
        {t("privacy.lastUpdated")}
      </p>

      <div className="mt-10 space-y-8 text-slate-600">
        {(["dataCollection", "dataUsage", "dataStorage", "thirdParties", "rights", "contact"] as const).map(
          (section) => (
            <div key={section}>
              <h2 className="text-lg font-semibold text-slate-800">
                {t(`privacy.${section}Title`)}
              </h2>
              <p className="mt-2 leading-relaxed">
                {t(`privacy.${section}Content`)}
              </p>
            </div>
          )
        )}
      </div>
    </section>
  );
}
