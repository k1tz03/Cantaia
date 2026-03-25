"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useTranslations } from "next-intl";

interface EmailSyncPreviewProps {
  syncing: boolean;
  emailCount: number;
}

const DOT_COLORS = ["#EF4444", "#F97316", "#3B82F6", "#10B981"];

export function EmailSyncPreview({ syncing, emailCount }: EmailSyncPreviewProps) {
  const t = useTranslations("onboarding.email");
  const senders = ["M. Dupont", "ArchiLab SA", "CFC Solutions", "Commune de Morges"];
  const subjectKeys = ["s1", "s2", "s3", "s4"] as const;

  const springCount = useSpring(0, { stiffness: 50, damping: 20 });
  springCount.set(emailCount);
  const displayCount = useTransform(springCount, (v) => Math.round(v));

  return (
    <motion.div
      className="overflow-hidden rounded-xl border border-[#27272A] bg-[#0F0F11] p-4"
      animate={syncing ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }}
      transition={syncing ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : {}}
    >
      <div className="space-y-3">
        {subjectKeys.map((key, i) => (
          <motion.div
            key={key}
            className="flex items-center gap-3 rounded-lg bg-[#18181B] px-3 py-2"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.3, duration: 0.4 }}
          >
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: DOT_COLORS[i] }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[#FAFAFA]">
                {senders[i]}
              </p>
              <p className="truncate text-xs text-[#71717A]">
                {t(`previewSubjects.${key}`)}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
      <motion.p
        className="mt-3 text-center text-sm font-medium text-[#F97316]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        <motion.span>{displayCount}</motion.span>{" "}
        {t("emailsFound", { count: emailCount })}
      </motion.p>
    </motion.div>
  );
}
