"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

interface StepTransitionProps {
  stepKey: number;
  direction: 1 | -1;
  children: ReactNode;
}

const variants = {
  enter: (direction: number) => ({
    x: direction * 300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction * -300,
    opacity: 0,
  }),
};

export function StepTransition({ stepKey, direction, children }: StepTransitionProps) {
  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={stepKey}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
