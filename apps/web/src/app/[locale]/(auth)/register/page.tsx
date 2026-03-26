"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { MicrosoftButton } from "@/components/auth/MicrosoftButton";
import { GoogleButton } from "@/components/auth/GoogleButton";

export default function RegisterPage() {
  const t = useTranslations("auth");

  return (
    <AuthCard title={t("createAccount")} subtitle={t("registerSubtitle")}>
      {/* OAuth providers */}
      <div className="mb-6 flex flex-col gap-3">
        <MicrosoftButton label={t("signupWithMicrosoft")} />
        <GoogleButton label={t("signupWithGoogle")} />
      </div>

      {/* Divider */}
      <div className="mb-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-[#27272A]" />
        <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71717A]">
          {t("orContinueWith")}
        </span>
        <div className="h-px flex-1 bg-[#27272A]" />
      </div>

      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
