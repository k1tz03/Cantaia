import type { Metadata } from "next";
import { useTranslations } from "next-intl";

const privacySeo: Record<string, { title: string; description: string }> = {
  fr: {
    title: "Politique de Confidentialité",
    description:
      "Politique de confidentialité de Cantaia. Hébergement européen, chiffrement, conforme RGPD, nLPD et droit suisse.",
  },
  en: {
    title: "Privacy Policy",
    description:
      "Cantaia privacy policy. European hosting, encryption, GDPR and Swiss data protection (nFADP) compliant.",
  },
  de: {
    title: "Datenschutzerklärung",
    description:
      "Datenschutzerklärung von Cantaia. Europäisches Hosting, Verschlüsselung, DSGVO- und nDSG-konform.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const seo = privacySeo[locale] || privacySeo.fr;

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: `https://cantaia.io/${locale}/legal/privacy`,
      languages: {
        fr: "https://cantaia.io/fr/legal/privacy",
        en: "https://cantaia.io/en/legal/privacy",
        de: "https://cantaia.io/de/legal/privacy",
      },
    },
  };
}

export default function PrivacyPage() {
  const t = useTranslations("legal");

  return (
    <section className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
      <h1 className="text-3xl font-bold tracking-tight text-[#FAFAFA] sm:text-4xl">
        {t("privacy.title")}
      </h1>
      <p className="mt-4 text-sm text-[#71717A]">
        {t("privacy.lastUpdated")}
      </p>

      <div className="mt-10 space-y-8 text-[#A1A1AA]">
        {(["dataCollection", "dataUsage", "dataStorage", "thirdParties", "rights", "contact"] as const).map(
          (section) => (
            <div key={section}>
              <h2 className="text-lg font-semibold text-[#FAFAFA]">
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
