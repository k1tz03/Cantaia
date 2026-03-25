"use client";

import { motion } from "framer-motion";

interface CantaiaLogoProps {
  size?: "sm" | "lg";
}

export function CantaiaLogo({ size = "lg" }: CantaiaLogoProps) {
  const boxSize = size === "lg" ? "w-16 h-16" : "w-8 h-8";
  const textSize = size === "lg" ? "text-2xl" : "text-sm";
  const letterSize = size === "lg" ? "text-2xl" : "text-base";

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        className={`${boxSize} flex items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#EA580C]`}
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <span className={`${letterSize} font-bold text-white`}>C</span>
      </motion.div>
      <motion.span
        className={`${textSize} font-display font-bold text-white`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        Cantaia
      </motion.span>
    </div>
  );
}
