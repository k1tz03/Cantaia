"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import CraneScene from "./CraneScene";
import {
  ChantierButton,
  FicheRow,
  Hazard,
  RegMarks,
  SceneLabel,
  SitePlacard,
} from "./primitives";

function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
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
  }, [ref]);

  return progress;
}

function AnimatedNumber({
  target,
  decimals = 0,
  duration = 1400,
  suffix = "",
  prefix = "",
  active,
  orange = false,
}: {
  target: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  active: boolean;
  orange?: boolean;
}) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(eased * target);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);

  const formatted = value.toFixed(decimals).replace(".", ",");
  return (
    <span>
      {prefix}
      <span className={orange ? "text-[#F97316]" : "text-[#FAFAFA]"}>{formatted}</span>
      {suffix && (
        <span className="ml-1 text-[26px] font-700 text-[#52525B] align-top">{suffix}</span>
      )}
    </span>
  );
}

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.3) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return inView;
}

export default function LandingChantier() {
  const t = useTranslations("chantier.landingPage");
  const sceneRef = useRef<HTMLElement>(null);
  const metricsRef = useRef<HTMLElement>(null);
  const sceneProgress = useScrollProgress(sceneRef);
  const metricsInView = useInView(metricsRef, 0.35);
  const pct = Math.round(sceneProgress * 100);

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

  return (
    <div className="relative bg-[#0A0A0C] font-sans text-[#FAFAFA]">
      <RegMarks />

      {/* ==== SIDE AXIS ==== */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-[30px] top-1/2 z-40 hidden font-tech text-[9px] uppercase tracking-[0.24em] text-[#52525B] md:block"
        style={{
          transform: "translateY(-50%) rotate(180deg)",
          writingMode: "vertical-rl",
        }}
      >
        {t("sideAxis")}
      </div>

      {/* ==== COORD DISPLAY ==== */}
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-[22px] left-[48px] z-40 hidden gap-[18px] font-tech text-[10px] text-[#52525B] md:flex"
      >
        <span>
          <span className="mr-[3px] text-[#52525B]">N</span>
          <span className="text-[#A1A1AA]">47°22&#39;37&quot;</span>
        </span>
        <span>
          <span className="mr-[3px] text-[#52525B]">E</span>
          <span className="text-[#A1A1AA]">08°32&#39;30&quot;</span>
        </span>
        <span>
          <span className="mr-[3px] text-[#52525B]">Z</span>
          <span className="text-[#A1A1AA]">+412.8m</span>
        </span>
      </div>

      {/* ==== SITE STAMP (bottom right) ==== */}
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-[22px] right-[48px] z-40 hidden items-center gap-3 font-condensed text-[11px] font-800 uppercase tracking-[0.12em] text-[#A1A1AA] md:flex"
      >
        <span className="border border-[#F97316] bg-[#F97316]/10 px-[10px] py-[4px] text-[#F97316]">
          {t("zoneActive")}
        </span>
        <span>{t("siteStamp")}</span>
      </div>

      {/* ==== HERO ==== */}
      <section className="relative grid min-h-screen grid-rows-[auto_1fr_auto] overflow-hidden px-6 pb-14 pt-[120px] sm:px-12 md:px-16">
        {/* Hero stamp 01 */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-10 top-20 z-0 select-none font-condensed font-900 leading-[0.78] tracking-[-0.05em] text-[#111114]"
          style={{ fontSize: "clamp(180px, 24vw, 360px)" }}
        >
          01
        </div>

        <header className="relative z-10 flex items-start justify-between font-tech text-[11px] uppercase tracking-[0.18em] text-[#52525B]">
          <div className="border-l-[3px] border-[#F97316] py-[2px] pl-[14px] font-condensed text-[13px] font-800 tracking-[0.16em] text-[#FAFAFA]">
            {t("hero.sectionMarker")}
          </div>
          <div className="hidden md:block">
            {t("hero.locationCity")} · <span className="text-[#A1A1AA]">{t("hero.locationTagline")}</span>
          </div>
        </header>

        <h1
          className="relative z-10 my-auto font-condensed font-900 uppercase leading-[0.88] tracking-[-0.018em]"
          style={{ fontSize: "clamp(52px, 11vw, 176px)", maxWidth: "1400px" }}
        >
          <div className="block overflow-hidden">
            <span
              className="block"
              style={{ transform: "translateY(105%)", animation: "rise-up 1s 0.1s cubic-bezier(.16,1,.3,1) forwards" }}
            >
              {t("hero.titleLine1")}
            </span>
          </div>
          <div className="block overflow-hidden">
            <span
              className="block italic text-[#F97316]"
              style={{ transform: "translateY(105%)", animation: "rise-up 1s 0.18s cubic-bezier(.16,1,.3,1) forwards" }}
            >
              {t("hero.titleLine2")}
            </span>
          </div>
          <div className="block overflow-hidden">
            <span
              className="block"
              style={{ transform: "translateY(105%)", animation: "rise-up 1s 0.26s cubic-bezier(.16,1,.3,1) forwards" }}
            >
              {t("hero.titleLine3")}
            </span>
          </div>
          <div className="block overflow-hidden">
            <span
              className="block text-[#52525B]"
              style={{ transform: "translateY(105%)", animation: "rise-up 1s 0.34s cubic-bezier(.16,1,.3,1) forwards" }}
            >
              {t("hero.titleLine4")}
            </span>
          </div>
        </h1>

        <div className="relative z-10 mt-10 grid grid-cols-1 items-end gap-10 md:grid-cols-[1fr_auto]">
          <p
            className="max-w-[560px] text-[15px] leading-[1.55] text-[#A1A1AA] opacity-0"
            style={{ animation: "fade-in 1s 0.8s forwards" }}
          >
            <strong className="font-condensed text-[15px] font-800 uppercase tracking-[0.02em] text-[#FAFAFA]">
              {t("hero.subtitleBrand")}
            </strong>{" "}
            {t("hero.subtitleBody")}
            <br />
            <br />
            {t("hero.subtitleTagline")}
          </p>
          <div
            className="flex flex-wrap gap-4 opacity-0"
            style={{ animation: "fade-in 1s 1s forwards" }}
          >
            <ChantierButton variant="primary" href="/register">
              {t("hero.ctaPrimary")}
            </ChantierButton>
            <ChantierButton variant="ghost" href="/fondateur">
              {t("hero.ctaSecondary")}
            </ChantierButton>
          </div>
        </div>
      </section>

      <Hazard />

      {/* ==== 3D SCENE ==== */}
      <section ref={sceneRef} className="relative bg-[#0A0A0C]" style={{ height: "320vh" }}>
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          <CraneScene scrollRef={sceneRef} />

          {/* Overlay */}
          <div className="pointer-events-none absolute inset-0 z-10">
            {/* Site Placard */}
            <div className="absolute left-6 top-[88px] sm:left-12 md:left-16">
              <SitePlacard
                lot={t("scene.placardLot")}
                title={t("scene.placardTitle")}
                cfc={t("scene.placardCfc")}
              />
            </div>

            {/* Progress */}
            <div className="absolute right-6 top-[88px] border border-[#3F3F46] bg-[#0A0A0C] px-4 py-3 font-tech text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA] sm:right-12 md:right-16">
              {t("scene.sequenceLabel")}
              <div className="mt-[6px] font-condensed text-[52px] font-900 leading-none tracking-[-0.03em] text-[#FAFAFA] tabular-nums">
                {String(pct).padStart(2, "0")}
                <span className="text-[22px] text-[#52525B]">%</span>
              </div>
            </div>

            {/* Scene Labels (fade in with scroll progress) */}
            <div
              className="absolute left-[7%] top-[22%] transition-opacity duration-500"
              style={{ opacity: sceneProgress > 0.1 && sceneProgress < 0.85 ? 1 : 0 }}
            >
              <SceneLabel code={t("scene.label1Code")} value={t("scene.label1SurfaceValue")} x="0" y="0" />
              <div className="mt-2 max-w-[220px] border border-[#3F3F46] bg-[#0A0A0C]/90 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.12em] text-[#FAFAFA] backdrop-blur-sm">
                <div className="mb-1 font-condensed text-[11px] font-900 tracking-[0.18em] text-[#F97316]">
                  {t("scene.label1Code")}
                </div>
                {t("scene.label1Line1")}
                <br />
                {t("scene.label1SurfaceLabel")} <span className="text-[#F97316] font-bold">{t("scene.label1SurfaceValue")}</span>
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
                {t("scene.label2LoadLabel")} <span className="text-[#F97316] font-bold">{t("scene.label2LoadValue")}</span>
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
                {t("scene.label3VolumeLabel")} <span className="text-[#F97316] font-bold">{t("scene.label3VolumeValue")}</span>
              </div>
            </div>

            {/* Scene Caption */}
            <div className="absolute bottom-10 left-6 right-6 grid grid-cols-1 items-end gap-8 sm:bottom-20 sm:left-12 sm:right-12 md:left-16 md:right-16 md:grid-cols-[1fr_auto] md:gap-12">
              <h2
                className="max-w-[880px] font-condensed font-800 uppercase leading-[0.95] tracking-[-0.012em]"
                style={{ fontSize: "clamp(30px, 5vw, 72px)" }}
              >
                {t("scene.captionLine1")} <em className="not-italic font-900 italic text-[#F97316]">{t("scene.captionLine1Highlight")}</em>
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

      <Hazard height="h-[22px]" />

      {/* ==== NARRATIVE ==== */}
      <section className="relative overflow-hidden bg-[#111114] px-6 py-[140px] sm:px-12 md:px-16 md:py-[200px]">
        <div
          aria-hidden
          className="pointer-events-none absolute right-10 top-20 select-none font-condensed font-900 leading-[0.8] tracking-[-0.05em] text-[#0A0A0C]"
          style={{ fontSize: "clamp(220px, 34vw, 500px)" }}
        >
          02
        </div>

        <div className="relative z-[2] mb-12 flex items-center gap-[18px] font-condensed text-[14px] font-800 uppercase tracking-[0.18em] text-[#FAFAFA]">
          <span className="h-[3px] w-16 bg-[#F97316]" />
          {t("narrative.sectionMarker")}
        </div>

        <div
          className="relative z-[2] max-w-[1200px] font-condensed font-500 uppercase leading-[1.05] tracking-[-0.008em] text-[#FAFAFA]"
          style={{ fontSize: "clamp(28px, 4.6vw, 70px)" }}
        >
          <p className="mb-[0.3em]">
            <span className="mr-[10px] inline-block font-900 italic text-[#F97316]">{t("narrative.time")}</span>
            {t("narrative.paragraph1")}{" "}
            <span className="text-[#52525B] line-through decoration-[#F97316] decoration-[2px]">
              {t("narrative.strikethrough")}
            </span>{" "}
            {t("narrative.paragraph1End")}
          </p>
          <p className="mt-[0.6em]">{t("narrative.paragraph2")}</p>
        </div>

        <div className="relative z-[2] mt-20 max-w-[580px] border-l-[3px] border-[#F97316] pl-6 font-tech text-[13px] leading-[1.75] text-[#FAFAFA]">
          {t("narrative.sideNote")}
        </div>
      </section>

      {/* ==== METRICS ==== */}
      <section
        ref={metricsRef}
        className="relative border-y-2 border-[#27272A] bg-[#0A0A0C] px-6 py-24 sm:px-12 md:px-16"
      >
        <div className="mb-10 flex items-baseline justify-between border-b border-[#27272A] pb-10 font-tech text-[10px] uppercase tracking-[0.18em] text-[#52525B]">
          <span className="font-condensed text-[22px] font-900 uppercase tracking-[0.06em] text-[#FAFAFA]">
            <span className="mr-2 text-[#F97316]">{t("metrics.sectionNumber")}</span>{t("metrics.sectionTitle")}
          </span>
          <span className="hidden sm:inline">{t("metrics.sectionSubtitle")}</span>
        </div>

        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-4">
          {/* M01 */}
          <div className="border-b border-[#27272A] p-8 pl-0 lg:border-b-0 lg:border-r lg:pr-8">
            <div className="mb-5 flex items-center gap-[10px] font-tech text-[9px] uppercase tracking-[0.2em] text-[#52525B]">
              <span className="border border-[#F97316] px-[6px] py-[1px] font-condensed text-[12px] font-900 tracking-[0.04em] text-[#F97316]">
                {t("metrics.m01.code")}
              </span>
              <span>{t("metrics.m01.category")}</span>
            </div>
            <div
              className="font-condensed font-900 leading-[0.88] tracking-[-0.03em] tabular-nums"
              style={{ fontSize: "clamp(48px, 7vw, 96px)" }}
            >
              <AnimatedNumber target={2.2} decimals={1} suffix="h" active={metricsInView} orange />
            </div>
            <div className="mt-5 font-condensed text-[14px] font-800 uppercase tracking-[0.06em] text-[#FAFAFA]">
              {t("metrics.m01.label")}
            </div>
            <p className="mt-2 max-w-[230px] text-[12px] leading-[1.55] text-[#A1A1AA]">
              {t("metrics.m01.desc")}
            </p>
          </div>

          {/* M02 */}
          <div className="border-b border-[#27272A] p-8 lg:border-b-0 lg:border-r lg:px-8">
            <div className="mb-5 flex items-center gap-[10px] font-tech text-[9px] uppercase tracking-[0.2em] text-[#52525B]">
              <span className="border border-[#F97316] px-[6px] py-[1px] font-condensed text-[12px] font-900 tracking-[0.04em] text-[#F97316]">
                {t("metrics.m02.code")}
              </span>
              <span>{t("metrics.m02.category")}</span>
            </div>
            <div
              className="font-condensed font-900 leading-[0.88] tracking-[-0.03em] tabular-nums"
              style={{ fontSize: "clamp(48px, 7vw, 96px)" }}
            >
              <AnimatedNumber target={89} suffix="%" active={metricsInView} />
            </div>
            <div className="mt-5 font-condensed text-[14px] font-800 uppercase tracking-[0.06em] text-[#FAFAFA]">
              {t("metrics.m02.label")}
            </div>
            <p className="mt-2 max-w-[230px] text-[12px] leading-[1.55] text-[#A1A1AA]">
              {t("metrics.m02.desc")}
            </p>
          </div>

          {/* M03 */}
          <div className="border-b border-[#27272A] p-8 sm:border-b-0 lg:border-r lg:px-8">
            <div className="mb-5 flex items-center gap-[10px] font-tech text-[9px] uppercase tracking-[0.2em] text-[#52525B]">
              <span className="border border-[#F97316] px-[6px] py-[1px] font-condensed text-[12px] font-900 tracking-[0.04em] text-[#F97316]">
                {t("metrics.m03.code")}
              </span>
              <span>{t("metrics.m03.category")}</span>
            </div>
            <div
              className="font-condensed font-900 leading-[0.88] tracking-[-0.03em] tabular-nums"
              style={{ fontSize: "clamp(48px, 7vw, 96px)" }}
            >
              <AnimatedNumber target={11} active={metricsInView} />
            </div>
            <div className="mt-5 font-condensed text-[14px] font-800 uppercase tracking-[0.06em] text-[#FAFAFA]">
              {t("metrics.m03.label")}
            </div>
            <p className="mt-2 max-w-[230px] text-[12px] leading-[1.55] text-[#A1A1AA]">
              {t("metrics.m03.desc")}
            </p>
          </div>

          {/* M04 */}
          <div className="p-8 pr-0 lg:pl-8">
            <div className="mb-5 flex items-center gap-[10px] font-tech text-[9px] uppercase tracking-[0.2em] text-[#52525B]">
              <span className="border border-[#F97316] px-[6px] py-[1px] font-condensed text-[12px] font-900 tracking-[0.04em] text-[#F97316]">
                {t("metrics.m04.code")}
              </span>
              <span>{t("metrics.m04.category")}</span>
            </div>
            <div
              className="font-condensed font-900 leading-[0.88] tracking-[-0.03em] tabular-nums"
              style={{ fontSize: "clamp(48px, 7vw, 96px)" }}
            >
              <AnimatedNumber target={49} suffix=".—" active={metricsInView} orange />
            </div>
            <div className="mt-5 font-condensed text-[14px] font-800 uppercase tracking-[0.06em] text-[#FAFAFA]">
              {t("metrics.m04.label")}
            </div>
            <p className="mt-2 max-w-[230px] text-[12px] leading-[1.55] text-[#A1A1AA]">
              {t("metrics.m04.desc")}
            </p>
          </div>
        </div>
      </section>

      {/* ==== MODULES TEASER ==== */}
      <section className="relative overflow-hidden bg-[#0A0A0C] px-6 py-32 sm:px-12 md:px-16">
        <div className="mb-12 flex items-start justify-between gap-6">
          <div>
            <div className="mb-5 flex items-center gap-[18px] font-condensed text-[14px] font-800 uppercase tracking-[0.18em] text-[#FAFAFA]">
              <span className="h-[3px] w-16 bg-[#F97316]" />
              {t("modules.sectionMarker")}
            </div>
            <h2
              className="max-w-[1100px] font-condensed font-900 uppercase leading-[0.95] tracking-[-0.018em]"
              style={{ fontSize: "clamp(40px, 7vw, 110px)" }}
            >
              {t("modules.titleLine1")}<br />
              <em className="not-italic font-900 italic text-[#F97316]">{t("modules.titleLine2")}</em>
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-0 border-t border-[#27272A] md:grid-cols-3 lg:grid-cols-4">
          {modules.map((m, i) => (
            <div
              key={m.code}
              className={`group border-b border-r border-[#27272A] p-6 transition-colors hover:bg-[#111114] ${
                i % 4 === 3 ? "lg:border-r-0" : ""
              } ${i % 3 === 2 && i % 4 !== 3 ? "md:border-r-0 lg:border-r" : ""} ${
                i % 2 === 1 ? "border-r-0 md:border-r" : ""
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-tech text-[10px] font-bold tracking-[0.2em] text-[#F97316]">
                  {m.code}
                </span>
                <span className="font-tech text-[9px] tracking-[0.14em] text-[#52525B]">
                  {m.code === "+" ? t("modules.statusComing") : t("modules.statusActive")}
                </span>
              </div>
              <div className="font-condensed text-[22px] font-900 uppercase tracking-[0.02em] text-[#FAFAFA]">
                {m.title}
              </div>
              <p className="mt-2 text-[12px] leading-[1.55] text-[#A1A1AA]">{m.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-4">
          <ChantierButton variant="primary" href="/modules">
            {t("modules.ctaAll")}
          </ChantierButton>
          <ChantierButton variant="ghost" href="/produits">
            {t("modules.ctaUseCases")}
          </ChantierButton>
        </div>
      </section>

      {/* ==== CLOSING ==== */}
      <section className="relative bg-[#0A0A0C] px-6 py-28 text-center sm:px-12 md:px-16 md:py-40">
        <div className="mx-auto mb-10 flex items-center justify-center gap-[18px] font-condensed text-[13px] font-800 uppercase tracking-[0.22em] text-[#A1A1AA]">
          <span className="h-[2px] w-12 bg-[#F97316]" />
          {t("closing.sectionMarker")}
          <span className="h-[2px] w-12 bg-[#F97316]" />
        </div>
        <h2
          className="mx-auto max-w-[1200px] font-condensed font-900 uppercase leading-[0.88] tracking-[-0.022em]"
          style={{ fontSize: "clamp(48px, 9vw, 156px)" }}
        >
          {t("closing.titleLine1")} <em className="not-italic font-900 italic text-[#F97316]">{t("closing.titleLine1Highlight")}</em>
          <br />
          {t("closing.titleLine2")}
        </h2>
        <p className="mx-auto mt-10 max-w-[520px] text-[15px] leading-[1.55] text-[#A1A1AA]">
          {t("closing.description")}
        </p>
        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <ChantierButton variant="primary" href="/register" className="px-8 py-5 text-[15px]">
            {t("closing.ctaPrimary")}
          </ChantierButton>
          <ChantierButton variant="ghost" href="/tarifs" className="px-8 py-5 text-[15px]">
            {t("closing.ctaSecondary")}
          </ChantierButton>
        </div>
        <div className="mt-16 font-tech text-[12px] tracking-[0.06em] text-[#52525B]">
          {t("closing.founderPrefix")}{" "}
          <Link
            href="/fondateur"
            className="border-b border-[#27272A] pb-[2px] text-[#A1A1AA] transition-colors hover:border-[#F97316] hover:text-[#F97316]"
          >
            {t("closing.founderLink")}
          </Link>{" "}
          {t("closing.founderSuffix")}
        </div>
      </section>
    </div>
  );
}
