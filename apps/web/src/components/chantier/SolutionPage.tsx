import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ChantierButton, Hazard, RegMarks, SectionHeader } from "./primitives";
import { SolutionMockup, type SolutionKey } from "./solution-mockups";

export const SOLUTION_SLUGS: Record<SolutionKey, string> = {
  soumissions: "soumissions-cfc",
  pv: "pv-chantier",
  planning: "planning-chantier",
  rapports: "rapports-chantier",
};

const SOLUTION_ORDER: SolutionKey[] = ["soumissions", "pv", "planning", "rapports"];

/** i18n key of the short name shown in the cross-links, per solution. */
const NAME_KEY: Record<SolutionKey, string> = {
  soumissions: "index.s1Name",
  pv: "index.s2Name",
  planning: "index.s3Name",
  rapports: "index.s4Name",
};

/**
 * Shared layout for the four SEO solution pages.
 *
 * All copy lives in `chantier.solutionsPage.<solution>` so the German page is
 * written in German trade vocabulary rather than translated word for word.
 */
export default async function SolutionPage({
  locale,
  solution,
}: {
  locale: string;
  solution: SolutionKey;
}) {
  const t = await getTranslations({ locale, namespace: "chantier.solutionsPage" });
  const s = (key: string) => t(`${solution}.${key}`);

  const slug = SOLUTION_SLUGS[solution];
  const url = `https://cantaia.io/${locale}/solutions/${slug}`;

  const benefits = [1, 2, 3, 4].map((i) => ({
    title: s(`b${i}Title`),
    desc: s(`b${i}Desc`),
  }));

  const steps = [1, 2, 3, 4].map((i) => ({
    title: s(`s${i}Title`),
    desc: s(`s${i}Desc`),
  }));

  const faq = [1, 2, 3].map((i) => ({
    q: s(`faqQ${i}`),
    a: s(`faqA${i}`),
  }));

  const related = SOLUTION_ORDER.filter((k) => k !== solution).map((k) => ({
    href: `/solutions/${SOLUTION_SLUGS[k]}`,
    name: t(NAME_KEY[k]),
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: t("common.breadcrumbHome"),
            item: `https://cantaia.io/${locale}`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: t("common.breadcrumbSolutions"),
            item: `https://cantaia.io/${locale}/solutions`,
          },
          { "@type": "ListItem", position: 3, name: s("h1"), item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0A0C] text-[#FAFAFA]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <RegMarks blink={false} />

      {/* ==== HERO ==== */}
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
            <Link href="/solutions" className="py-1 transition-colors hover:text-[#F97316]">
              {t("common.breadcrumbSolutions")}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-[#A1A1AA]">{t(NAME_KEY[solution])}</span>
          </nav>

          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-16">
            <div>
              <span className="inline-block border border-[#F97316] px-2.5 py-1 font-tech text-[10px] font-bold uppercase tracking-[0.2em] text-[#F97316]">
                {s("badge")}
              </span>

              <h1
                className="mt-6 font-condensed font-900 uppercase leading-[0.94] tracking-[-0.02em] text-[#FAFAFA]"
                style={{ fontSize: "clamp(34px, 5.4vw, 68px)" }}
              >
                {s("h1")}
              </h1>

              <p className="mt-6 max-w-[620px] font-sans text-[17px] leading-relaxed text-[#D4D4D8]">
                {s("lead")}
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <ChantierButton href="/register" variant="primary">
                  {t("common.ctaPrimary")}
                </ChantierButton>
                <ChantierButton href="/pricing" variant="ghost">
                  {t("common.ctaSecondary")}
                </ChantierButton>
              </div>
            </div>

            <div className="lg:pt-6">
              <SolutionMockup solution={solution} />
            </div>
          </div>

          <div className="mt-14 grid max-w-[1000px] grid-cols-1 gap-6 border-t border-[#27272A] pt-10 md:grid-cols-2">
            <p className="font-sans text-[15px] leading-relaxed text-[#A1A1AA]">{s("intro1")}</p>
            <p className="font-sans text-[15px] leading-relaxed text-[#A1A1AA]">{s("intro2")}</p>
          </div>
        </div>
      </section>

      <Hazard />

      {/* ==== BENEFITS ==== */}
      <section className="bg-[#0F0F11] px-6 py-20 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeader step="01" title={t("common.benefitsTitle")} className="mb-12" />
          <div className="grid grid-cols-1 gap-px bg-[#27272A] sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b) => (
              <div key={b.title} className="bg-[#0F0F11] p-6">
                <h3 className="font-condensed text-[20px] font-900 uppercase leading-tight tracking-[0.01em] text-[#FAFAFA]">
                  {b.title}
                </h3>
                <p className="mt-3 font-sans text-[13.5px] leading-relaxed text-[#A1A1AA]">
                  {b.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Hazard height="h-[22px]" />

      {/* ==== HOW IT WORKS ==== */}
      <section className="bg-[#0A0A0C] px-6 py-20 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeader step="02" title={t("common.howTitle")} className="mb-12" />
          <ol className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li key={step.title} className="border-t-2 border-[#F97316] pt-5">
                <span className="font-tech text-[10px] uppercase tracking-[0.22em] text-[#F97316]">
                  {t("common.stepLabel")} 0{i + 1}
                </span>
                <h3 className="mt-3 font-condensed text-[21px] font-900 uppercase leading-tight tracking-[0.01em] text-[#FAFAFA]">
                  {step.title}
                </h3>
                <p className="mt-2.5 font-sans text-[13.5px] leading-relaxed text-[#A1A1AA]">
                  {step.desc}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Hazard />

      {/* ==== DETAIL ==== */}
      <section className="bg-[#0F0F11] px-6 py-20 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeader step="03" title={t("common.detailTitle")} className="mb-10" />
          <div className="grid max-w-[1000px] grid-cols-1 gap-6 md:grid-cols-2">
            <p className="font-sans text-[15px] leading-relaxed text-[#A1A1AA]">{s("detail1")}</p>
            <p className="font-sans text-[15px] leading-relaxed text-[#A1A1AA]">{s("detail2")}</p>
          </div>
        </div>
      </section>

      <Hazard height="h-[22px]" />

      {/* ==== FAQ ==== */}
      <section className="bg-[#0A0A0C] px-6 py-20 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeader step="04" title={t("common.faqTitle")} className="mb-10" />
          <div className="grid grid-cols-1 gap-px bg-[#27272A] md:grid-cols-3">
            {faq.map((item) => (
              <div key={item.q} className="bg-[#0A0A0C] p-6">
                <h3 className="font-condensed text-[19px] font-800 uppercase leading-tight tracking-[-0.005em] text-[#FAFAFA]">
                  {item.q}
                </h3>
                <p className="mt-3 font-sans text-[13.5px] leading-relaxed text-[#A1A1AA]">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Hazard />

      {/* ==== CTA + INTERNAL LINKS ==== */}
      <section className="bg-[#09090B] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <div className="text-center">
            <h2
              className="mx-auto max-w-[900px] font-condensed font-900 uppercase leading-[0.94] tracking-[-0.02em] text-[#FAFAFA]"
              style={{ fontSize: "clamp(30px, 5vw, 62px)" }}
            >
              {s("ctaTitle")}
            </h2>
            <p className="mx-auto mt-6 max-w-[560px] font-sans text-[16px] leading-relaxed text-[#A1A1AA]">
              {s("ctaDesc")}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <ChantierButton href="/register" variant="primary">
                {t("common.ctaPrimary")}
              </ChantierButton>
              <ChantierButton href="/pricing" variant="ghost">
                {t("common.ctaSecondary")}
              </ChantierButton>
            </div>
          </div>

          <div className="mt-20">
            <h2 className="font-condensed text-[14px] font-800 uppercase tracking-[0.2em] text-[#A1A1AA]">
              {t("common.relatedTitle")}
            </h2>
            <div className="mt-5 grid grid-cols-1 gap-px bg-[#27272A] sm:grid-cols-2 lg:grid-cols-4">
              {related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="group flex min-h-[64px] items-center justify-between gap-3 bg-[#09090B] px-5 py-4 transition-colors hover:bg-[#111114]"
                >
                  <span className="font-condensed text-[16px] font-800 uppercase tracking-[0.02em] text-[#FAFAFA] group-hover:text-[#F97316]">
                    {r.name}
                  </span>
                  <span className="font-tech text-[12px] text-[#F97316]" aria-hidden>
                    →
                  </span>
                </Link>
              ))}
              <Link
                href="/modules"
                className="group flex min-h-[64px] items-center justify-between gap-3 bg-[#09090B] px-5 py-4 transition-colors hover:bg-[#111114]"
              >
                <span className="font-condensed text-[16px] font-800 uppercase tracking-[0.02em] text-[#A1A1AA] group-hover:text-[#F97316]">
                  {t("common.allModules")}
                </span>
                <span className="font-tech text-[12px] text-[#F97316]" aria-hidden>
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
