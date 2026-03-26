"use client";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTour } from "./use-tour";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function TourOverlay() {
  const { active, currentStep, totalSteps, step, next, prev, skip } = useTour();
  const router = useRouter();
  const t = useTranslations("tour");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  // Find target element and calculate position
  const updatePosition = useCallback(() => {
    if (!step?.target) return;
    const el = document.querySelector(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      const pad = step.spotlightPadding ?? 8;
      setRect(new DOMRect(r.x - pad, r.y - pad, r.width + pad * 2, r.height + pad * 2));

      // Position tooltip
      const placement = step.placement || "bottom";
      let top = 0, left = 0;
      if (placement === "bottom") { top = r.bottom + 16; left = r.left; }
      else if (placement === "top") { top = r.top - 16 - 200; left = r.left; }
      else if (placement === "right") { top = r.top; left = r.right + 16; }
      else if (placement === "left") { top = r.top; left = r.left - 16 - 340; }
      // Clamp to viewport
      left = Math.max(16, Math.min(left, window.innerWidth - 360));
      top = Math.max(16, Math.min(top, window.innerHeight - 260));
      setTooltipPos({ top, left });
    }
  }, [step]);

  // Navigate to page if needed, then update position
  useEffect(() => {
    if (!active || !step) return;
    if (step.page) {
      // Check if we're already on this page
      const currentPath = window.location.pathname;
      const locale = currentPath.split("/")[1]; // e.g. "fr"
      const targetPath = `/${locale}${step.page}`;
      if (!currentPath.startsWith(targetPath)) {
        router.push(step.page);
        // Wait for navigation + render
        const timer = setTimeout(updatePosition, 800);
        return () => clearTimeout(timer);
      }
    }
    // Small delay to let elements render
    const timer = setTimeout(updatePosition, 100);
    return () => clearTimeout(timer);
  }, [active, step, currentStep, router, updatePosition]);

  // Update on resize/scroll
  useEffect(() => {
    if (!active) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [active, updatePosition]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [active, next, prev, skip]);

  if (!active) return null;

  // Build clip-path to cut out spotlight
  const clipPath = rect
    ? `polygon(
        0% 0%, 0% 100%,
        ${rect.x}px 100%, ${rect.x}px ${rect.y}px,
        ${rect.x + rect.width}px ${rect.y}px, ${rect.x + rect.width}px ${rect.y + rect.height}px,
        ${rect.x}px ${rect.y + rect.height}px, ${rect.x}px 100%,
        100% 100%, 100% 0%
      )`
    : "none";

  const isLast = currentStep === totalSteps - 1;
  const isFirst = currentStep === 0;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9998]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Dark backdrop with spotlight cutout */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-all duration-500"
          style={{ clipPath }}
          onClick={skip}
        />

        {/* Pulsing ring around target */}
        {rect && (
          <div
            className="absolute rounded-lg border-2 border-[#F97316] pointer-events-none animate-[tour-pulse_2s_infinite]"
            style={{
              top: rect.y,
              left: rect.x,
              width: rect.width,
              height: rect.height,
            }}
          />
        )}

        {/* Tooltip */}
        <motion.div
          key={currentStep}
          className="absolute z-[9999] w-[340px] rounded-2xl border border-[#27272A] bg-[#18181B] p-5 shadow-2xl"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <h3 className="mb-2 font-display text-base font-bold text-[#FAFAFA]">
            {t(step.titleKey)}
          </h3>
          <p className="mb-5 text-sm leading-relaxed text-[#A1A1AA]">
            {t(step.descriptionKey)}
          </p>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={prev}
              disabled={isFirst}
              className="flex items-center gap-1 rounded-lg border border-[#27272A] px-3 py-1.5 text-xs text-[#A1A1AA] transition-colors hover:text-[#FAFAFA] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3 w-3" />
              {t("prev")}
            </button>

            <span className="text-xs text-[#52525B]">
              {currentStep + 1} / {totalSteps}
            </span>

            <button
              type="button"
              onClick={next}
              className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#F97316] to-[#EA580C] px-4 py-1.5 text-xs font-medium text-white transition-shadow hover:shadow-lg hover:shadow-[#F97316]/25"
            >
              {isLast ? t("finish") : t("next")}
              {!isLast && <ChevronRight className="h-3 w-3" />}
            </button>
          </div>

          {/* Skip link */}
          <button
            type="button"
            onClick={skip}
            className="mt-3 block w-full text-center text-[10px] text-[#52525B] transition-colors hover:text-[#A1A1AA]"
          >
            {t("skip")}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
