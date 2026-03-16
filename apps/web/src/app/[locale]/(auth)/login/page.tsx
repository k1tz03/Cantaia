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
    <AuthCard title={t("login")}>
      {/* Show callback errors */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Erreur d&apos;authentification : {decodeURIComponent(error)}</span>
        </div>
      )}

      {/* OAuth providers */}
      <div className="space-y-3">
        <MicrosoftButton />
        <GoogleButton />
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-slate-400">
            {t("orContinueWith")}
          </span>
        </div>
      </div>

      <LoginForm />
    </AuthCard>
  );
}
