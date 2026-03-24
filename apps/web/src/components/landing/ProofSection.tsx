"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { useTranslations } from "next-intl";

function CountUp({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  useEffect(() => {
    if (!inView) return;
    const step = Math.ceil(target / 30);
    let current = 0;
    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      setCount(current);
    }, 40);
    return () => clearInterval(timer);
  }, [inView, target]);

  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
}

export function ProofSection() {
  const t = useTranslations("landing.statsBar");

  return (
    <section className="border-t border-b border-[rgba(39,39,42,0.5)] bg-[#18181B]" style={{ padding: "44px 48px" }}>
      <motion.div
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-[1000px] flex justify-around flex-wrap gap-6"
      >
        <div className="text-center">
          <div className="font-display text-[44px] font-extrabold bg-gradient-to-br from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
            <CountUp target={12} />
          </div>
          <div className="text-[13px] text-[#52525B] mt-1">{t("stat1Label")}</div>
        </div>
        <div className="text-center">
          <div className="font-display text-[44px] font-extrabold bg-gradient-to-br from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
            <CountUp target={3} />
          </div>
          <div className="text-[13px] text-[#52525B] mt-1">{t("stat2Label")}</div>
        </div>
        <div className="text-center">
          <div className="font-display text-[44px] font-extrabold bg-gradient-to-br from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
            {t("stat3Value")}
          </div>
          <div className="text-[13px] text-[#52525B] mt-1">{t("stat3Label")}</div>
        </div>
        <div className="text-center">
          <div className="font-display text-[44px] font-extrabold bg-gradient-to-br from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
            {t("stat4Value")}
          </div>
          <div className="text-[13px] text-[#52525B] mt-1">{t("stat4Label")}</div>
        </div>
      </motion.div>
    </section>
  );
}
