import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  ChantierButton,
  Crosshair,
  Hazard,
  RegMarks,
  SectionHeader,
} from "@/components/chantier/primitives";

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
    // The title already carries the brand — `absolute` stops the root layout
    // template from appending a second "| Cantaia".
    title: { absolute: seo.title },
    description: seo.description,
    alternates: {
      canonical: `https://cantaia.io/${locale}/about`,
      languages: {
        fr: "https://cantaia.io/fr/about",
        en: "https://cantaia.io/en/about",
        de: "https://cantaia.io/de/about",
        "x-default": "https://cantaia.io/fr/about",
      },
    },
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Reuse the founder story that already ships on the landing page — same
  // source of truth, translated in all three locales.
  const t = await getTranslations({ locale, namespace: "chantier.landingPage" });

  // The "export" guarantee (founder.g3) is intentionally omitted here: it
  // promises an org-wide data export the product does not yet expose.
  const guarantees = [
    { title: t("founder.g1Title"), desc: t("founder.g1Desc") },
    { title: t("founder.g2Title"), desc: t("founder.g2Desc") },
    { title: t("founder.g4Title"), desc: t("founder.g4Desc") },
  ];

  return (
    <main className="relative overflow-hidden bg-[#0A0A0C] text-[#FAFAFA]">
      <RegMarks blink={false} />

      {/* ==== HERO ==== */}
      <section className="relative px-6 pb-16 pt-28 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-8 flex items-center gap-3">
            <Crosshair size={16} />
            <span className="font-tech text-[11px] font-bold tracking-[0.3em] text-[#F97316]">
              {t("founder.sectionMarker")}
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-[#F97316] via-[#27272A] to-transparent" />
          </div>

          <h1
            className="font-condensed font-900 uppercase leading-[0.92] tracking-[-0.02em] text-[#FAFAFA]"
            style={{ fontSize: "clamp(40px, 6.4vw, 88px)" }}
          >
            {t("founder.title")}{" "}
            <em className="not-italic font-900 italic text-[#F97316]">
              {t("founder.titleHighlight")}
            </em>
          </h1>

          <div className="mt-10 max-w-[680px] space-y-5 font-sans text-[16px] leading-relaxed text-[#A1A1AA]">
            <p>{t("founder.body1")}</p>
            <p>{t("founder.body2")}</p>
          </div>

          <div className="mt-9 border-l-[3px] border-[#F97316] pl-5 font-condensed text-[14px] font-800 uppercase tracking-[0.18em] text-[#FAFAFA]">
            {t("founder.signature")}
          </div>
        </div>
      </section>

      <Hazard height="h-[6px]" />

      {/* ==== ENGAGEMENTS ==== */}
      <section className="relative bg-[#0F0F11] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1100px]">
          <SectionHeader
            step="02"
            title={t("founder.guaranteesTitle")}
            caption={t("swiss.subtitle")}
            className="mb-12"
          />

          <div className="grid grid-cols-1 gap-px bg-[#27272A] sm:grid-cols-3">
            {guarantees.map((g) => (
              <div key={g.title} className="bg-[#0F0F11] p-6">
                <div className="font-condensed text-[18px] font-900 uppercase tracking-[0.02em] text-[#FAFAFA]">
                  {g.title}
                </div>
                <p className="mt-2.5 font-sans text-[13.5px] leading-relaxed text-[#A1A1AA]">
                  {g.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Hazard height="h-[6px]" />

      {/* ==== CTA ==== */}
      <section className="relative bg-[#0A0A0C] px-6 py-24 text-center sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[720px]">
          <h2
            className="font-condensed font-900 uppercase leading-[0.94] tracking-[-0.02em] text-[#FAFAFA]"
            style={{ fontSize: "clamp(30px, 5vw, 60px)" }}
          >
            {t("swiss.title")}
          </h2>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <ChantierButton href="/register" variant="primary">
              {t("closing.ctaPrimary")}
            </ChantierButton>
            <ChantierButton href="/pricing" variant="ghost">
              {t("closing.ctaSecondary")}
            </ChantierButton>
          </div>
        </div>
      </section>
    </main>
  );
}
