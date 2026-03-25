"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { EmailSyncPreview } from "../EmailSyncPreview";

interface EmailConnectionStepProps {
  hasConnection: boolean;
  emailCount: number;
  onConnect: (provider: "microsoft" | "google") => void;
  onContinue: () => void;
  onSkip: () => void;
}

export function EmailConnectionStep({
  hasConnection,
  emailCount,
  onConnect,
  onContinue,
  onSkip,
}: EmailConnectionStepProps) {
  const t = useTranslations("onboarding.email");
  const tProgress = useTranslations("onboarding.progress");
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleConnect = (provider: "microsoft" | "google") => {
    setLoadingProvider(provider);
    onConnect(provider);
  };

  // Connected state
  if (hasConnection) {
    return (
      <div className="flex flex-col items-center py-8">
        {/* Checkmark animation */}
        <motion.div
          className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#10B981]/10"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
        >
          <svg
            className="h-8 w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10B981"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M5 13l4 4L19 7"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
            />
          </svg>
        </motion.div>

        <motion.h2
          className="mb-2 font-display text-xl font-bold text-[#10B981]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {t("connected")}
        </motion.h2>

        <motion.div
          className="mb-6 w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <EmailSyncPreview syncing={emailCount === 0} emailCount={emailCount} />
        </motion.div>

        <motion.button
          type="button"
          onClick={onContinue}
          className="rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-8 py-3 font-medium text-white transition-shadow hover:shadow-lg hover:shadow-[#F97316]/25"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {tProgress("continue")}
        </motion.button>
      </div>
    );
  }

  // Not connected
  return (
    <div className="flex flex-col items-center py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <h2 className="font-display text-2xl font-bold text-[#FAFAFA]">
          {t("title")}
        </h2>
        <p className="mt-2 text-sm text-[#A1A1AA]">{t("subtitle")}</p>
      </motion.div>

      <motion.div
        className="flex w-full max-w-md flex-col gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {/* Microsoft button */}
        <button
          type="button"
          onClick={() => handleConnect("microsoft")}
          disabled={!!loadingProvider}
          className="flex w-full items-center gap-4 rounded-xl border border-[#27272A] bg-[#18181B] p-4 text-left transition-all hover:border-[#F97316] disabled:opacity-50"
        >
          {loadingProvider === "microsoft" ? (
            <Loader2 className="h-6 w-6 animate-spin text-[#A1A1AA]" />
          ) : (
            <svg className="h-6 w-6 shrink-0" viewBox="0 0 23 23">
              <path fill="#f35325" d="M1 1h10v10H1z" />
              <path fill="#81bc06" d="M12 1h10v10H12z" />
              <path fill="#05a6f0" d="M1 12h10v10H1z" />
              <path fill="#ffba08" d="M12 12h10v10H12z" />
            </svg>
          )}
          <div>
            <p className="font-medium text-[#FAFAFA]">{t("connectOutlook")}</p>
            <p className="text-xs text-[#71717A]">Microsoft 365 / Outlook</p>
          </div>
        </button>

        {/* Google button */}
        <button
          type="button"
          onClick={() => handleConnect("google")}
          disabled={!!loadingProvider}
          className="flex w-full items-center gap-4 rounded-xl border border-[#27272A] bg-[#18181B] p-4 text-left transition-all hover:border-[#F97316] disabled:opacity-50"
        >
          {loadingProvider === "google" ? (
            <Loader2 className="h-6 w-6 animate-spin text-[#A1A1AA]" />
          ) : (
            <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          <div>
            <p className="font-medium text-[#FAFAFA]">{t("connectGmail")}</p>
            <p className="text-xs text-[#71717A]">Google Workspace / Gmail</p>
          </div>
        </button>
      </motion.div>

      <motion.p
        className="mt-4 text-center text-xs text-[#52525B]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        {t("skipNote")}
      </motion.p>

      <motion.button
        type="button"
        onClick={onSkip}
        className="mt-4 text-sm text-[#52525B] transition-colors hover:text-[#A1A1AA]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {tProgress("later")}
      </motion.button>
    </div>
  );
}
