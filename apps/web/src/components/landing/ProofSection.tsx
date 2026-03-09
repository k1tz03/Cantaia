"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

function CountUp({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  useEffect(() => {
    if (!inView) return;
    const duration = 1500;
    const start = performance.now();
    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [inView, target]);

  return <span ref={ref}>{count.toLocaleString("fr-CH")}{suffix}</span>;
}

const stats = [
  { target: 2500, suffix: "+", label: "offres analysées" },
  { target: 60, suffix: "+", label: "fournisseurs référencés" },
  { display: "3 ans", label: "de données réelles" },
  { display: "🇨🇭", label: "Made in Switzerland" },
];

export function ProofSection() {
  return (
    <section className="bg-white border-y border-[#E5E7EB]">
      <div className="mx-auto max-w-[1200px] px-6 py-12">
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-0 md:divide-x md:divide-[#E5E7EB]">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              className="flex flex-col items-center px-8 md:px-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
            >
              <div className="font-display text-3xl font-bold text-[#2563EB]">
                {stat.target != null ? (
                  <CountUp target={stat.target} suffix={stat.suffix} />
                ) : (
                  stat.display
                )}
              </div>
              <div className="mt-1 text-sm text-[#6B7280]">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
