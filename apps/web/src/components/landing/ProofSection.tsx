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
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [inView, target]);

  return <span ref={ref}>{count.toLocaleString("fr-CH")}{suffix}</span>;
}

const stats = [
  { target: 2500, suffix: "+", label: "offres analysées" },
  { target: 12, suffix: "", label: "modules intégrés" },
  { target: 3, suffix: "", label: "moteurs IA" },
  { display: "2h", label: "gagnées par jour" },
];

export function ProofSection() {
  return (
    <section className="relative bg-[#0F0F11]">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27272A] to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27272A] to-transparent" />

      <div className="mx-auto max-w-[1200px] px-6 py-14">
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-0 md:divide-x md:divide-[#27272A]">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              className="flex flex-col items-center px-8 md:px-14"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
            >
              <div className="font-display text-3xl font-bold bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
                {stat.target != null ? (
                  <CountUp target={stat.target} suffix={stat.suffix} />
                ) : (
                  stat.display
                )}
              </div>
              <div className="mt-1.5 text-sm font-medium text-[#71717A]">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
