"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { MicrosoftButton } from "@/components/auth/MicrosoftButton";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { AlertTriangle } from "lucide-react";

export default function LoginPage() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <AuthCard title={t("login")} subtitle={t("subtitle")}>
      {/* Show callback errors */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#EF4444]">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Erreur d&apos;authentification : {decodeURIComponent(error)}</span>
        </div>
      )}

      {/* OAuth providers */}
      <div className="mb-6 flex flex-col gap-3">
        <MicrosoftButton />
        <GoogleButton />
      </div>

      {/* Divider */}
      <div className="mb-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-[#27272A]" />
        <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71717A]">
          {t("orContinueWith")}
        </span>
        <div className="h-px flex-1 bg-[#27272A]" />
      </div>

      <LoginForm />
    </AuthCard>
  );
}
