"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@cantaia/core/models";
import { forgotPasswordAction } from "@/app/[locale]/(auth)/actions";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = (data: ForgotPasswordInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await forgotPasswordAction(data);
      if (result.error) {
        setServerError(result.error);
      } else {
        setSuccess(true);
      }
    });
  };

  if (success) {
    return (
      <AuthCard title={t("forgotPasswordTitle")}>
        <div className="space-y-4 text-center">
          <div className="rounded-[10px] border border-[#22C55E]/30 bg-[#22C55E]/10 p-4">
            <p className="text-sm text-[#22C55E]">
              {t("forgotPasswordSuccess")}
            </p>
          </div>
          <Link
            href="/login"
            className="inline-block text-sm font-semibold text-[#F97316] hover:text-[#FB923C] hover:underline"
          >
            {t("backToLogin")}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("forgotPasswordTitle")} subtitle={t("forgotPasswordDescription")}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {serverError && (
          <div className="mb-4 rounded-[10px] border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#EF4444]">
            {serverError}
          </div>
        )}

        <div className="mb-6">
          <label
            htmlFor="email"
            className="mb-1.5 block text-[13px] font-medium text-[#A1A1AA]"
          >
            {t("email")}
          </label>
          <input
            {...register("email")}
            type="email"
            id="email"
            autoComplete="email"
            placeholder="votre@email.ch"
            className="h-[46px] w-full rounded-[10px] border border-[#27272A] bg-[#1C1C1F] px-4 text-sm text-[#FAFAFA] placeholder-[#52525B] outline-none transition-all focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)]"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-[#EF4444]">
              {errors.email.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="flex h-[50px] w-full items-center justify-center rounded-[14px] bg-gradient-to-r from-[#F97316] to-[#EA580C] font-display text-[15px] font-bold tracking-[0.01em] text-white shadow-[0_2px_12px_rgba(249,115,22,0.25)] transition-all hover:-translate-y-px hover:shadow-[0_4px_24px_rgba(249,115,22,0.35),0_0_0_2px_rgba(249,115,22,0.15)] active:translate-y-0 active:shadow-[0_2px_8px_rgba(249,115,22,0.2)] disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("sendResetLink")}
        </button>

        <p className="mt-6 text-center text-sm text-[#A1A1AA]">
          <Link
            href="/login"
            className="font-semibold text-[#F97316] transition-colors hover:text-[#FB923C] hover:underline"
          >
            {t("backToLogin")}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
