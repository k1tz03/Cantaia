import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import SolutionPage from "@/components/chantier/SolutionPage";

const PATH = "/solutions/soumissions-cfc";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "chantier.solutionsPage.soumissions.seo",
  });

  return {
    // No brand in the translated title → the root layout template appends
    // "| Cantaia" exactly once.
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `https://cantaia.io/${locale}${PATH}`,
      languages: {
        fr: `https://cantaia.io/fr${PATH}`,
        en: `https://cantaia.io/en${PATH}`,
        de: `https://cantaia.io/de${PATH}`,
        "x-default": `https://cantaia.io/fr${PATH}`,
      },
    },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <SolutionPage locale={locale} solution="soumissions" />;
}
