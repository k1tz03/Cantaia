"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
// three.js lives entirely inside CraneScene. Loading it with next/dynamic
// (ssr:false) keeps the WebGL bundle out of the initial page chunk — the
// import fires only when the scene actually mounts, i.e. desktop + motion
// allowed (see `useDesktopScene`). Phones never download three.js.
const CraneScene = dynamic(() => import("./CraneScene"), { ssr: false });
import {
  MockupStyles,
  MailDecisionsMockup,
  ClassifyMockup,
  CompareMockup,
  GanttMockup,
  CranePoster,
} from "./mockups";
import {
  CREDIT_PACK_LIST,
  CREDIT_PLAN_LIST,
  RECOMMENDED_PLAN_ID,
  SIGNUP_BONUS_CREDITS,
} from "@/components/credits/credit-config";
import {
  ChantierButton,
  FicheRow,
  Hazard,
  RegMarks,
  SceneLabel,
  SitePlacard,
} from "./primitives";

function useScrollProgress(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    function onScroll() {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = Math.max(0, -rect.top);
      const p = total > 0 ? Math.min(1, Math.max(0, scrolled / total)) : 0;
      setProgress(p);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref, enabled]);

  return progress;
}

/**
 * `true` only once mounted on a viewport ≥ 1024px.
 *
 * The WebGL crane scene is the heaviest thing on the page (three.js bundle +
 * a full-screen canvas with a rAF loop). Below `lg` it is never mounted at
 * all — a static CSS/SVG poster takes its place — so phones do not pay for a
 * decorative animation in bundle weight or battery.
 */
function useDesktopScene() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setIsDesktop(mq.matches && !reduce.matches);
    update();
    mq.addEventListener("change", update);
    reduce.addEventListener("change", update);
    return () => {
      mq.removeEventListener("change", update);
      reduce.removeEventListener("change", update);
    };
  }, []);

  return isDesktop;
}

function SectionMarker({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-[18px] font-condensed text-[13px] font-800 uppercase tracking-[0.18em] text-[#FAFAFA]">
      <span className="h-[3px] w-12 bg-[#F97316]" />
      {children}
    </div>
  );
}

export default function LandingChantier() {
  const t = useTranslations("chantier.landingPage");
  const tPlans = useTranslations("chantier.pricingPage");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(
    locale === "de" ? "de-CH" : locale === "en" ? "en-CH" : "fr-CH",
  );
  const sceneRef = useRef<HTMLElement>(null);
  const isDesktop = useDesktopScene();
  const sceneProgress = useScrollProgress(sceneRef, isDesktop);
  const pct = Math.round(sceneProgress * 100);

  const credits = SIGNUP_BONUS_CREDITS;

  const modules = [
    { code: "M01", title: t("modules.m01.title"), desc: t("modules.m01.desc") },
    { code: "M02", title: t("modules.m02.title"), desc: t("modules.m02.desc") },
    { code: "M03", title: t("modules.m03.title"), desc: t("modules.m03.desc") },
    { code: "M04", title: t("modules.m04.title"), desc: t("modules.m04.desc") },
    { code: "M05", title: t("modules.m05.title"), desc: t("modules.m05.desc") },
    { code: "M06", title: t("modules.m06.title"), desc: t("modules.m06.desc") },
    { code: "M07", title: t("modules.m07.title"), desc: t("modules.m07.desc") },
    { code: "M08", title: t("modules.m08.title"), desc: t("modules.m08.desc") },
    { code: "M09", title: t("modules.m09.title"), desc: t("modules.m09.desc") },
    { code: "M10", title: t("modules.m10.title"), desc: t("modules.m10.desc") },
    { code: "M11", title: t("modules.m11.title"), desc: t("modules.m11.desc") },
    { code: "+", title: t("modules.m12.title"), desc: t("modules.m12.desc") },
  ];

  const facts = [t("hero.fact1"), t("hero.fact2"), t("hero.fact3"), t("hero.fact4")];

  const swissCards = [
    { code: t("swiss.c1Code"), title: t("swiss.c1Title"), desc: t("swiss.c1Desc") },
    { code: t("swiss.c2Code"), title: t("swiss.c2Title"), desc: t("swiss.c2Desc") },
    { code: t("swiss.c3Code"), title: t("swiss.c3Title"), desc: t("swiss.c3Desc") },
    { code: t("swiss.c4Code"), title: t("swiss.c4Title"), desc: t("swiss.c4Desc") },
    { code: t("swiss.c5Code"), title: t("swiss.c5Title"), desc: t("swiss.c5Desc") },
  ];

  const guarantees = [
    { title: t("founder.g1Title"), desc: t("founder.g1Desc") },
    { title: t("founder.g2Title"), desc: t("founder.g2Desc") },
    { title: t("founder.g3Title"), desc: t("founder.g3Desc") },
    { title: t("founder.g4Title"), desc: t("founder.g4Desc") },
  ];

  const faq = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
    { q: t("faq.q5"), a: t("faq.a5") },
    { q: t("faq.q6"), a: t("faq.a6") },
  ];

  return (
    <div className="relative bg-[#0A0A0C] font-sans text-[#FAFAFA]">
      <MockupStyles />
      <RegMarks />

      {/* ==== SIDE AXIS ==== */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-[30px] top-1/2 z-40 hidden font-tech text-[9px] uppercase tracking-[0.24em] text-[#A1A1AA] xl:block"
        style={{
          transform: "translateY(-50%) rotate(180deg)",
          writingMode: "vertical-rl",
        }}
      >
        {t("sideAxis")}
      </div>

      {/* ==== 01 · HERO ==== */}
      <section className="relative overflow-hidden px-6 pb-20 pt-[104px] sm:px-10 lg:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute right-6 top-16 z-0 select-none font-condensed font-900 leading-[0.78] tracking-[-0.05em] text-[#111114]"
          style={{ fontSize: "clamp(140px, 20vw, 320px)" }}
        >
          01
        </div>

        <div className="relative z-10 mx-auto max-w-[1400px]">
          <header className="flex items-start justify-between font-tech text-[11px] uppercase tracking-[0.18em] text-[#A1A1AA]">
            <div className="border-l-[3px] border-[#F97316] py-[2px] pl-[14px] font-condensed text-[13px] font-800 tracking-[0.16em] text-[#FAFAFA]">
              {t("hero.sectionMarker")}
            </div>
            <div className="hidden md:block">
              {t("hero.locationCity")} ·{" "}
              <span className="text-[#A1A1AA]">{t("hero.locationTagline")}</span>
            </div>
          </header>

          <div className="mt-10 grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14">
            {/* -- Promise -- */}
            <div>
              <h1
                className="font-condensed font-900 uppercase leading-[0.92] tracking-[-0.018em]"
                style={{ fontSize: "clamp(40px, 6.2vw, 82px)" }}
              >
                <span className="block motion-safe:animate-rise-up">{t("hero.titleLine1")}</span>
                <span
                  className="block italic text-[#F97316] motion-safe:animate-rise-up"
                  style={{ animationDelay: "80ms" }}
                >
                  {t("hero.titleLine2")}
                </span>
                <span
                  className="block motion-safe:animate-rise-up"
                  style={{ animationDelay: "160ms" }}
                >
                  {t("hero.titleLine3")}
                </span>
                <span
                  className="block text-[#A1A1AA] motion-safe:animate-rise-up"
                  style={{ animationDelay: "240ms" }}
                >
                  {t("hero.titleLine4")}
                </span>
              </h1>

              <p className="mt-8 max-w-[560px] text-[15px] leading-[1.6] text-[#A1A1AA]">
                <strong className="font-condensed text-[15px] font-800 uppercase tracking-[0.02em] text-[#FAFAFA]">
                  {t("hero.subtitleBrand")}
                </strong>{" "}
                {t("hero.subtitleBody")}
              </p>
              <p className="mt-4 max-w-[560px] text-[14px] leading-[1.6] text-[#A1A1AA]">
                {t("hero.subtitleTagline")}
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <ChantierButton variant="primary" href="/register">
                  {t("hero.ctaPrimary", { credits })}
                </ChantierButton>
                <ChantierButton variant="ghost" href="/pricing">
                  {t("hero.ctaSecondary")}
                </ChantierButton>
              </div>

              {/* Facts — verifiable product statements, not made-up metrics */}
              <ul className="mt-10 grid grid-cols-1 gap-x-8 gap-y-2.5 border-t border-[#27272A] pt-6 sm:grid-cols-2">
                {facts.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2.5 font-tech text-[11px] uppercase tracking-[0.12em] text-[#A1A1AA]"
                  >
                    <span className="mt-[5px] h-[6px] w-[6px] shrink-0 bg-[#F97316]" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* -- Product -- */}
            <div className="lg:pt-3">
              <MailDecisionsMockup />
            </div>
          </div>
        </div>
      </section>

      <Hazard />

      {/* ==== 02 · PRODUIT EN ACTION ==== */}
      <section className="relative bg-[#0F0F11] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionMarker>{t("action.sectionMarker")}</SectionMarker>
          <h2
            className="max-w-[1000px] font-condensed font-900 uppercase leading-[0.98] tracking-[-0.016em]"
            style={{ fontSize: "clamp(30px, 4.4vw, 62px)" }}
          >
            {t("action.title")}{" "}
            <em className="not-italic font-900 italic text-[#F97316]">
              {t("action.titleHighlight")}
            </em>
          </h2>
          <p className="mt-5 max-w-[620px] text-[15px] leading-relaxed text-[#A1A1AA]">
            {t("action.subtitle")}
          </p>

          <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-3">
            {[
              {
                label: t("action.step1Label"),
                title: t("action.step1Title"),
                desc: t("action.step1Desc"),
                mockup: <ClassifyMockup />,
              },
              {
                label: t("action.step2Label"),
                title: t("action.step2Title"),
                desc: t("action.step2Desc"),
                mockup: <CompareMockup />,
              },
              {
                label: t("action.step3Label"),
                title: t("action.step3Title"),
                desc: t("action.step3Desc"),
                mockup: <GanttMockup />,
              },
            ].map((s) => (
              <article key={s.label} className="flex flex-col">
                <div className="font-tech text-[10px] uppercase tracking-[0.22em] text-[#F97316]">
                  {s.label}
                </div>
                <h3 className="mt-3 font-condensed text-[24px] font-900 uppercase leading-tight tracking-[-0.01em] text-[#FAFAFA]">
                  {s.title}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[#A1A1AA]">{s.desc}</p>
                <div className="mt-6">{s.mockup}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Hazard height="h-[22px]" />

      {/* ==== 03 · NARRATIVE ==== */}
      <section className="relative overflow-hidden bg-[#111114] px-6 py-24 sm:px-10 lg:px-16 lg:py-32">
        <div
          aria-hidden
          className="pointer-events-none absolute right-6 top-12 select-none font-condensed font-900 leading-[0.8] tracking-[-0.05em] text-[#0A0A0C]"
          style={{ fontSize: "clamp(180px, 28vw, 420px)" }}
        >
          03
        </div>

        <div className="relative z-[2] mx-auto max-w-[1400px]">
          <SectionMarker>{t("narrative.sectionMarker")}</SectionMarker>

          <div
            className="max-w-[1150px] font-condensed font-500 uppercase leading-[1.06] tracking-[-0.008em] text-[#FAFAFA]"
            style={{ fontSize: "clamp(26px, 4vw, 60px)" }}
          >
            <p className="mb-[0.3em]">
              <span className="mr-[10px] inline-block font-900 italic text-[#F97316]">
                {t("narrative.time")}
              </span>
              {t("narrative.paragraph1")}{" "}
              <span className="text-[#A1A1AA] line-through decoration-[#F97316] decoration-[2px]">
                {t("narrative.strikethrough")}
              </span>{" "}
              {t("narrative.paragraph1End")}
            </p>
            <p className="mt-[0.6em]">{t("narrative.paragraph2")}</p>
          </div>

          <div className="mt-14 max-w-[580px] border-l-[3px] border-[#F97316] pl-6 font-tech text-[13px] leading-[1.75] text-[#FAFAFA]">
            {t("narrative.sideNote")}
          </div>
        </div>
      </section>

      {/* ==== 3D SCENE (desktop only) / STATIC POSTER (mobile & reduced motion) ==== */}
      {isDesktop ? (
        <section ref={sceneRef} className="relative bg-[#0A0A0C]" style={{ height: "320vh" }}>
          <div className="sticky top-0 h-screen w-full overflow-hidden">
            <CraneScene scrollRef={sceneRef} />

            <div className="pointer-events-none absolute inset-0 z-10">
              <div className="absolute left-6 top-[88px] sm:left-12 md:left-16">
                <SitePlacard
                  lot={t("scene.placardLot")}
                  title={t("scene.placardTitle")}
                  cfc={t("scene.placardCfc")}
                />
              </div>

              <div className="absolute right-6 top-[88px] border border-[#3F3F46] bg-[#0A0A0C] px-4 py-3 font-tech text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA] sm:right-12 md:right-16">
                {t("scene.sequenceLabel")}
                <div className="mt-[6px] font-condensed text-[52px] font-900 leading-none tracking-[-0.03em] text-[#FAFAFA] tabular-nums">
                  {String(pct).padStart(2, "0")}
                  <span className="text-[22px] text-[#A1A1AA]">%</span>
                </div>
              </div>

              <div
                className="absolute left-[7%] top-[22%] transition-opacity duration-500"
                style={{ opacity: sceneProgress > 0.1 && sceneProgress < 0.85 ? 1 : 0 }}
              >
                <SceneLabel
                  code={t("scene.label1Code")}
                  value={t("scene.label1SurfaceValue")}
                  x="0"
                  y="0"
                />
                <div className="mt-2 max-w-[220px] border border-[#3F3F46] bg-[#0A0A0C]/90 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.12em] text-[#FAFAFA] backdrop-blur-sm">
                  <div className="mb-1 font-condensed text-[11px] font-900 tracking-[0.18em] text-[#F97316]">
                    {t("scene.label1Code")}
                  </div>
                  {t("scene.label1Line1")}
                  <br />
                  {t("scene.label1SurfaceLabel")}{" "}
                  <span className="font-bold text-[#F97316]">{t("scene.label1SurfaceValue")}</span>
                </div>
              </div>

              <div
                className="absolute right-[7%] top-[42%] text-right transition-opacity duration-500"
                style={{ opacity: sceneProgress > 0.25 && sceneProgress < 0.95 ? 1 : 0 }}
              >
                <div className="max-w-[220px] border border-[#3F3F46] bg-[#0A0A0C]/90 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.12em] text-[#FAFAFA] backdrop-blur-sm">
                  <div className="mb-1 font-condensed text-[11px] font-900 tracking-[0.18em] text-[#F97316]">
                    {t("scene.label2Code")}
                  </div>
                  {t("scene.label2Line1")}
                  <br />
                  {t("scene.label2LoadLabel")}{" "}
                  <span className="font-bold text-[#F97316]">{t("scene.label2LoadValue")}</span>
                </div>
              </div>

              <div
                className="absolute bottom-[30%] left-[12%] transition-opacity duration-500"
                style={{ opacity: sceneProgress > 0.4 ? 1 : 0 }}
              >
                <div className="max-w-[220px] border border-[#3F3F46] bg-[#0A0A0C]/90 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.12em] text-[#FAFAFA] backdrop-blur-sm">
                  <div className="mb-1 font-condensed text-[11px] font-900 tracking-[0.18em] text-[#F97316]">
                    {t("scene.label3Code")}
                  </div>
                  {t("scene.label3Line1")}
                  <br />
                  {t("scene.label3VolumeLabel")}{" "}
                  <span className="font-bold text-[#F97316]">{t("scene.label3VolumeValue")}</span>
                </div>
              </div>

              <div className="absolute bottom-10 left-6 right-6 grid grid-cols-1 items-end gap-8 sm:bottom-20 sm:left-12 sm:right-12 md:left-16 md:right-16 md:grid-cols-[1fr_auto] md:gap-12">
                <h2
                  className="max-w-[880px] font-condensed font-800 uppercase leading-[0.95] tracking-[-0.012em]"
                  style={{ fontSize: "clamp(30px, 5vw, 72px)" }}
                >
                  {t("scene.captionLine1")}{" "}
                  <em className="not-italic font-900 italic text-[#F97316]">
                    {t("scene.captionLine1Highlight")}
                  </em>
                  <br />
                  {t("scene.captionLine2")}
                </h2>
                <div className="min-w-[240px] border-l-[3px] border-[#F97316] bg-[#111114] px-[18px] py-4">
                  <FicheRow k={t("scene.fiche.projet")} v={t("scene.fiche.projetValue")} />
                  <FicheRow k={t("scene.fiche.mo")} v={t("scene.fiche.moValue")} />
                  <FicheRow k={t("scene.fiche.montant")} v={t("scene.fiche.montantValue")} accent />
                  <FicheRow k={t("scene.fiche.delai")} v={t("scene.fiche.delaiValue")} />
                  <FicheRow k={t("scene.fiche.suivi")} v={t("scene.fiche.suiviValue")} />
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="relative bg-[#0A0A0C] px-6 py-16 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-[1400px]">
            <SitePlacard
              lot={t("scene.placardLot")}
              title={t("scene.placardTitle")}
              cfc={t("scene.placardCfc")}
            />
            <div className="mt-6">
              <CranePoster alt={t("scene.posterAlt")} caption={t("scene.posterCaption")} />
            </div>
            <h2
              className="mt-8 font-condensed font-800 uppercase leading-[0.98] tracking-[-0.012em]"
              style={{ fontSize: "clamp(28px, 7vw, 48px)" }}
            >
              {t("scene.captionLine1")}{" "}
              <em className="not-italic font-900 italic text-[#F97316]">
                {t("scene.captionLine1Highlight")}
              </em>
              <br />
              {t("scene.captionLine2")}
            </h2>
            <div className="mt-8 border-l-[3px] border-[#F97316] bg-[#111114] px-[18px] py-4">
              <FicheRow k={t("scene.fiche.projet")} v={t("scene.fiche.projetValue")} />
              <FicheRow k={t("scene.fiche.mo")} v={t("scene.fiche.moValue")} />
              <FicheRow k={t("scene.fiche.montant")} v={t("scene.fiche.montantValue")} accent />
              <FicheRow k={t("scene.fiche.delai")} v={t("scene.fiche.delaiValue")} />
              <FicheRow k={t("scene.fiche.suivi")} v={t("scene.fiche.suiviValue")} />
            </div>
          </div>
        </section>
      )}

      <Hazard height="h-[22px]" />

      {/* ==== 04 · CONSTRUIT POUR LA SUISSE ==== */}
      <section className="relative bg-[#0F0F11] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionMarker>{t("swiss.sectionMarker")}</SectionMarker>
          <h2
            className="max-w-[900px] font-condensed font-900 uppercase leading-[0.98] tracking-[-0.016em]"
            style={{ fontSize: "clamp(32px, 5vw, 68px)" }}
          >
            {t("swiss.title")}{" "}
            <em className="not-italic font-900 italic text-[#F97316]">{t("swiss.titleHighlight")}</em>
          </h2>
          <p className="mt-5 max-w-[640px] text-[15px] leading-relaxed text-[#A1A1AA]">
            {t("swiss.subtitle")}
          </p>

          <div className="mt-12 grid grid-cols-1 gap-px bg-[#27272A] sm:grid-cols-2 lg:grid-cols-3">
            {swissCards.map((c) => (
              <div key={c.title} className="bg-[#0F0F11] p-6">
                <span className="inline-block border border-[#F97316] px-2 py-[2px] font-tech text-[10px] font-bold uppercase tracking-[0.18em] text-[#F97316]">
                  {c.code}
                </span>
                <h3 className="mt-4 font-condensed text-[21px] font-900 uppercase tracking-[0.01em] text-[#FAFAFA]">
                  {c.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#A1A1AA]">{c.desc}</p>
              </div>
            ))}
            <div className="hidden bg-[#0F0F11] lg:block" />
          </div>
        </div>
      </section>

      <Hazard />

      {/* ==== 05 · MODULES ==== */}
      <section className="relative overflow-hidden bg-[#0A0A0C] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionMarker>{t("modules.sectionMarker")}</SectionMarker>
          <h2
            className="max-w-[1100px] font-condensed font-900 uppercase leading-[0.95] tracking-[-0.018em]"
            style={{ fontSize: "clamp(34px, 5.6vw, 88px)" }}
          >
            {t("modules.titleLine1")}
            <br />
            <em className="not-italic font-900 italic text-[#F97316]">{t("modules.titleLine2")}</em>
          </h2>

          <div className="mt-12 grid grid-cols-2 gap-px border border-[#27272A] bg-[#27272A] md:grid-cols-3 lg:grid-cols-4">
            {modules.map((m) => (
              <div key={m.code} className="bg-[#0A0A0C] p-5 transition-colors hover:bg-[#111114]">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-tech text-[10px] font-bold tracking-[0.2em] text-[#F97316]">
                    {m.code}
                  </span>
                  <span className="font-tech text-[9px] tracking-[0.14em] text-[#A1A1AA]">
                    {m.code === "+" ? t("modules.statusComing") : t("modules.statusActive")}
                  </span>
                </div>
                <div className="font-condensed text-[21px] font-900 uppercase tracking-[0.02em] text-[#FAFAFA]">
                  {m.title}
                </div>
                <p className="mt-2 text-[12px] leading-[1.55] text-[#A1A1AA]">{m.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <ChantierButton variant="primary" href="/modules">
              {t("modules.ctaAll")}
            </ChantierButton>
            <ChantierButton variant="ghost" href="/solutions">
              {t("modules.ctaUseCases")}
            </ChantierButton>
          </div>
        </div>
      </section>

      <Hazard height="h-[22px]" />

      {/* ==== 06 · MODÈLE CRÉDITS ==== */}
      <section className="relative bg-[#0F0F11] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionMarker>{t("credits.sectionMarker")}</SectionMarker>
          <h2
            className="max-w-[900px] font-condensed font-900 uppercase leading-[0.98] tracking-[-0.016em]"
            style={{ fontSize: "clamp(32px, 5vw, 68px)" }}
          >
            {t("credits.title")}{" "}
            <em className="not-italic font-900 italic text-[#F97316]">
              {t("credits.titleHighlight")}
            </em>
          </h2>
          <p className="mt-5 max-w-[680px] text-[15px] leading-relaxed text-[#A1A1AA]">
            {t("credits.subtitle")}
          </p>

          {/* how it works */}
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[t("credits.how1", { credits }), t("credits.how2"), t("credits.how3")].map((step, i) => (
              <div key={i} className="border-t-2 border-[#F97316] bg-[#18181B] p-5">
                <span className="font-condensed text-[13px] font-900 uppercase tracking-[0.2em] text-[#F97316]">
                  0{i + 1}
                </span>
                <p className="mt-3 text-[13.5px] leading-relaxed text-[#D4D4D8]">{step}</p>
              </div>
            ))}
          </div>

          {/* packs */}
          <h3 className="mt-16 font-condensed text-[15px] font-800 uppercase tracking-[0.2em] text-[#FAFAFA]">
            {t("credits.packsTitle")}
            <span className="ml-3 font-tech text-[10px] font-normal tracking-[0.14em] text-[#A1A1AA]">
              {t("credits.packsNote")}
            </span>
          </h3>
          <div className="mt-5 grid grid-cols-2 gap-px bg-[#27272A] lg:grid-cols-4">
            {CREDIT_PACK_LIST.map((pack) => (
              <div key={pack.id} className="bg-[#0F0F11] px-5 py-6">
                <div className="font-condensed text-[34px] font-900 leading-none tabular-nums text-[#FAFAFA]">
                  {nf.format(pack.credits)}
                </div>
                <div className="mt-1 font-tech text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
                  {t("credits.creditsUnit")}
                </div>
                <div className="mt-4 font-condensed text-[19px] font-800 text-[#F97316]">
                  CHF {pack.priceCHF}
                  <span className="ml-1.5 font-tech text-[10px] font-normal uppercase tracking-[0.14em] text-[#A1A1AA]">
                    {t("credits.oneShot")}
                  </span>
                </div>
                <div className="mt-1 font-tech text-[10px] tabular-nums text-[#A1A1AA]">
                  {pack.pricePerCredit.toFixed(3)} {t("credits.perCredit")}
                </div>
              </div>
            ))}
          </div>

          {/* subscriptions */}
          <h3 className="mt-14 font-condensed text-[15px] font-800 uppercase tracking-[0.2em] text-[#FAFAFA]">
            {t("credits.plansTitle")}
            <span className="ml-3 font-tech text-[10px] font-normal tracking-[0.14em] text-[#A1A1AA]">
              {t("credits.plansNote")}
            </span>
          </h3>
          <div className="mt-5 grid grid-cols-1 gap-px bg-[#27272A] md:grid-cols-3">
            {CREDIT_PLAN_LIST.map((plan) => {
              const highlight = plan.id === RECOMMENDED_PLAN_ID;
              return (
                <div
                  key={plan.id}
                  className={`relative bg-[#0F0F11] px-5 py-6 ${
                    highlight ? "shadow-[0_0_0_1px_#F97316_inset]" : ""
                  }`}
                >
                  {highlight && (
                    <span className="absolute right-4 top-4 bg-[#F97316] px-2 py-[2px] font-tech text-[9px] font-bold uppercase tracking-[0.18em] text-[#0A0A0C]">
                      {t("credits.recommended")}
                    </span>
                  )}
                  <div className="font-condensed text-[15px] font-900 uppercase tracking-[0.16em] text-[#A1A1AA]">
                    {tPlans(`plans.${plan.id}.name`)}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-condensed text-[40px] font-900 leading-none tabular-nums text-[#FAFAFA]">
                      {plan.priceCHF}
                    </span>
                    <span className="font-tech text-[11px] uppercase tracking-[0.12em] text-[#A1A1AA]">
                      CHF {t("credits.perMonth")}
                    </span>
                  </div>
                  <div className="mt-4 font-tech text-[11px] uppercase tracking-[0.14em] text-[#F97316]">
                    {nf.format(plan.credits)} {t("credits.creditsUnit")}
                    <span className="text-[#A1A1AA]"> {t("credits.perMonth")}</span>
                  </div>
                  <div className="mt-1 font-tech text-[10px] tabular-nums text-[#A1A1AA]">
                    {plan.pricePerCredit.toFixed(3)} {t("credits.perCredit")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* what the free credits cover */}
          <div className="mt-12 border border-[#27272A] bg-[#18181B] p-6">
            <div className="font-condensed text-[13px] font-800 uppercase tracking-[0.2em] text-[#F97316]">
              {t("credits.exampleTitle", { credits })}
            </div>
            <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[
                t("credits.example1"),
                t("credits.example2"),
                t("credits.example3"),
                t("credits.example4"),
              ].map((ex) => (
                <li key={ex} className="flex items-start gap-2.5 text-[13.5px] text-[#D4D4D8]">
                  <span className="mt-[7px] h-[6px] w-[6px] shrink-0 bg-[#F97316]" aria-hidden />
                  {ex}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <ChantierButton variant="primary" href="/register">
              {t("credits.ctaSecondary")}
            </ChantierButton>
            <ChantierButton variant="ghost" href="/pricing">
              {t("credits.cta")}
            </ChantierButton>
          </div>
        </div>
      </section>

      <Hazard />

      {/* ==== 07 · FONDATEUR & GARANTIES ==== */}
      <section className="relative bg-[#0A0A0C] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionMarker>{t("founder.sectionMarker")}</SectionMarker>

          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
            <div>
              <h2
                className="font-condensed font-900 uppercase leading-[0.98] tracking-[-0.016em]"
                style={{ fontSize: "clamp(30px, 4.4vw, 60px)" }}
              >
                {t("founder.title")}{" "}
                <em className="not-italic font-900 italic text-[#F97316]">
                  {t("founder.titleHighlight")}
                </em>
              </h2>
              <p className="mt-6 max-w-[600px] text-[15px] leading-relaxed text-[#A1A1AA]">
                {t("founder.body1")}
              </p>
              <p className="mt-4 max-w-[600px] text-[15px] leading-relaxed text-[#A1A1AA]">
                {t("founder.body2")}
              </p>
              <div className="mt-7 border-l-[3px] border-[#F97316] pl-5 font-condensed text-[14px] font-800 uppercase tracking-[0.18em] text-[#FAFAFA]">
                {t("founder.signature")}
              </div>
            </div>

            <div>
              <h3 className="font-condensed text-[14px] font-800 uppercase tracking-[0.2em] text-[#A1A1AA]">
                {t("founder.guaranteesTitle")}
              </h3>
              <div className="mt-5 grid grid-cols-1 gap-px bg-[#27272A] sm:grid-cols-2">
                {guarantees.map((g) => (
                  <div key={g.title} className="bg-[#0A0A0C] p-5">
                    <div className="font-condensed text-[17px] font-900 uppercase tracking-[0.02em] text-[#FAFAFA]">
                      {g.title}
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#A1A1AA]">{g.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Hazard height="h-[22px]" />

      {/* ==== 08 · FAQ ==== */}
      <section className="relative bg-[#0F0F11] px-6 py-24 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1400px]">
          <SectionMarker>{t("faq.sectionMarker")}</SectionMarker>
          <h2
            className="max-w-[900px] font-condensed font-900 uppercase leading-[0.98] tracking-[-0.016em]"
            style={{ fontSize: "clamp(30px, 4.6vw, 64px)" }}
          >
            {t("faq.title")}{" "}
            <em className="not-italic font-900 italic text-[#F97316]">{t("faq.titleHighlight")}</em>
          </h2>
          <p className="mt-5 max-w-[600px] text-[15px] leading-relaxed text-[#A1A1AA]">
            {t("faq.subtitle")}
          </p>

          <div className="mt-12 grid grid-cols-1 gap-px bg-[#27272A] md:grid-cols-2">
            {faq.map((item) => (
              <div key={item.q} className="bg-[#0F0F11] p-6">
                <h3 className="font-condensed text-[20px] font-800 uppercase leading-tight tracking-[-0.005em] text-[#FAFAFA]">
                  {item.q}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[#A1A1AA]">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Hazard />

      {/* ==== 09 · CLOSING ==== */}
      <section className="relative bg-[#0A0A0C] px-6 py-24 text-center sm:px-10 lg:px-16 lg:py-32">
        <div className="mx-auto mb-8 flex items-center justify-center gap-[18px] font-condensed text-[13px] font-800 uppercase tracking-[0.22em] text-[#A1A1AA]">
          <span className="h-[2px] w-10 bg-[#F97316]" />
          {t("closing.sectionMarker")}
          <span className="h-[2px] w-10 bg-[#F97316]" />
        </div>
        <h2
          className="mx-auto max-w-[1150px] font-condensed font-900 uppercase leading-[0.9] tracking-[-0.022em]"
          style={{ fontSize: "clamp(38px, 7vw, 120px)" }}
        >
          {t("closing.titleLine1")}{" "}
          <em className="not-italic font-900 italic text-[#F97316]">
            {t("closing.titleLine1Highlight")}
          </em>
          <br />
          {t("closing.titleLine2")}
        </h2>
        <p className="mx-auto mt-8 max-w-[560px] text-[15px] leading-[1.6] text-[#A1A1AA]">
          {t("closing.description", { credits })}
        </p>
        <div className="mt-11 flex flex-wrap justify-center gap-4">
          <ChantierButton variant="primary" href="/register" className="px-8 py-5 text-[15px]">
            {t("closing.ctaPrimary")}
          </ChantierButton>
          <ChantierButton variant="ghost" href="/pricing" className="px-8 py-5 text-[15px]">
            {t("closing.ctaSecondary")}
          </ChantierButton>
        </div>
      </section>
    </div>
  );
}
