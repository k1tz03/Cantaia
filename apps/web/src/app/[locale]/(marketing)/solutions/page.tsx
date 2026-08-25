import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ChantierButton, Hazard, RegMarks } from "@/components/chantier/primitives";
import { SOLUTION_SLUGS } from "@/components/chantier/SolutionPage";

const PATH = "/solutions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chantier.solutionsPage.seo" });

  return {
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

export default async function SolutionsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chantier.solutionsPage" });

  const cards = [
    {
      code: "S01",
      href: `/solutions/${SOLUTION_SLUGS.soumissions}`,
      name: t("index.s1Name"),
      desc: t("index.s1Desc"),
    },
    {
      code: "S02",
      href: `/solutions/${SOLUTION_SLUGS.pv}`,
      name: t("index.s2Name"),
      desc: t("index.s2Desc"),
    },
    {
      code: "S03",
      href: `/solutions/${SOLUTION_SLUGS.planning}`,
      name: t("index.s3Name"),
      desc: t("index.s3Desc"),
    },
    {
      code: "S04",
      href: `/solutions/${SOLUTION_SLUGS.rapports}`,
      name: t("index.s4Name"),
      desc: t("index.s4Desc"),
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: cards.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      url: `https://cantaia.io/${locale}${c.href}`,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0A0C] text-[#FAFAFA]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <RegMarks blink={false} />

      <section className="relative px-6 pb-16 pt-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <nav
            aria-label={t("common.breadcrumbSolutions")}
            className="mb-8 flex flex-wrap items-center gap-2 font-tech text-[10px] uppercase tracking-[0.16em] text-[#A1A1AA]"
          >
            <Link href="/" className="py-1 transition-colors hover:text-[#F97316]">
              {t("common.breadcrumbHome")}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-[#A1A1AA]">{t("common.breadcrumbSolutions")}</span>
          </nav>

          <div className="mb-6 flex items-center gap-3">
            <div className="h-[1px] w-12 bg-[#F97316]" />
            <span className="font-tech text-[11px] font-bold tracking-[0.3em] text-[#F97316]">
              {t("index.sectionMarker")}
            </span>
          </div>

          <h1
            className="font-condensed font-900 uppercase leading-[0.94] tracking-[-0.02em] text-[#FAFAFA]"
            style={{ fontSize: "clamp(38px, 6.4vw, 84px)" }}
          >
            {t("index.titleLine1")}
            <br />
            <span className="text-[#F97316]">{t("index.titleLine2")}</span>
          </h1>

          <p className="mt-8 max-w-[720px] font-sans text-[16px] leading-relaxed text-[#A1A1AA]">
            {t("index.description")}
          </p>
        </div>
      </section>

      <Hazard />

      <section className="bg-[#0F0F11] px-6 py-20 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid grid-cols-1 gap-px bg-[#27272A] md:grid-cols-2">
            {cards.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group flex flex-col bg-[#0F0F11] p-7 transition-colors hover:bg-[#111114]"
              >
                <span className="font-tech text-[10px] font-bold uppercase tracking-[0.22em] text-[#F97316]">
                  {c.code}
                </span>
                <h2 className="mt-4 font-condensed text-[28px] font-900 uppercase leading-tight tracking-[0.01em] text-[#FAFAFA] group-hover:text-[#F97316]">
                  {c.name}
                </h2>
                <p className="mt-3 font-sans text-[14px] leading-relaxed text-[#A1A1AA]">{c.desc}</p>
                <span className="mt-6 inline-flex items-center gap-2 font-condensed text-[12px] font-800 uppercase tracking-[0.2em] text-[#A1A1AA] group-hover:text-[#F97316]">
                  {t("index.cardCta")}
                  <span className="font-tech text-[11px]" aria-hidden>
                    →
                  </span>
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap gap-4">
            <ChantierButton href="/register" variant="primary">
              {t("common.ctaPrimary")}
            </ChantierButton>
            <ChantierButton href="/pricing" variant="ghost">
              {t("common.ctaSecondary")}
            </ChantierButton>
            <ChantierButton href="/modules" variant="ghost">
              {t("common.allModules")}
            </ChantierButton>
          </div>
        </div>
      </section>
    </main>
  );
}
