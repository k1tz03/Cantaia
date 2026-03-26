"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@cantaia/core/models";
import { createClient } from "@/lib/supabase/client";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = (data: ResetPasswordInput) => {
    setServerError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });
      if (error) {
        setServerError(error.message);
      } else {
        setSuccess(true);
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      }
    });
  };

  if (success) {
    return (
      <AuthCard title={t("resetPasswordTitle")}>
        <div className="space-y-4 text-center">
          <div className="rounded-[10px] border border-[#22C55E]/30 bg-[#22C55E]/10 p-4">
            <p className="text-sm text-[#22C55E]">
              {t("resetPasswordSuccess")}
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
    <AuthCard title={t("resetPasswordTitle")} subtitle={t("resetPasswordDescription")}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {serverError && (
          <div className="mb-4 rounded-[10px] border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#EF4444]">
            {serverError}
          </div>
        )}

        {/* New password */}
        <div className="mb-4">
          <label
            htmlFor="password"
            className="mb-1.5 block text-[13px] font-medium text-[#A1A1AA]"
          >
            {t("newPassword")}
          </label>
          <div className="relative">
            <input
              {...register("password")}
              type={showPassword ? "text" : "password"}
              id="password"
              autoComplete="new-password"
              className="h-[46px] w-full rounded-[10px] border border-[#27272A] bg-[#1C1C1F] px-4 pr-[46px] text-sm text-[#FAFAFA] placeholder-[#52525B] outline-none transition-all focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#71717A] transition-colors hover:text-[#A1A1AA]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-[18px] w-[18px]" />
              ) : (
                <Eye className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-[#EF4444]">
              {t("passwordMinLength")}
            </p>
          )}
        </div>

        {/* Confirm password */}
        <div className="mb-6">
          <label
            htmlFor="confirmPassword"
            className="mb-1.5 block text-[13px] font-medium text-[#A1A1AA]"
          >
            {t("confirmPassword")}
          </label>
          <input
            {...register("confirmPassword")}
            type="password"
            id="confirmPassword"
            autoComplete="new-password"
            className="h-[46px] w-full rounded-[10px] border border-[#27272A] bg-[#1C1C1F] px-4 text-sm text-[#FAFAFA] placeholder-[#52525B] outline-none transition-all focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)]"
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-[#EF4444]">
              {t("passwordsMismatch")}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="flex h-[50px] w-full items-center justify-center rounded-[14px] bg-gradient-to-r from-[#F97316] to-[#EA580C] font-display text-[15px] font-bold tracking-[0.01em] text-white shadow-[0_2px_12px_rgba(249,115,22,0.25)] transition-all hover:-translate-y-px hover:shadow-[0_4px_24px_rgba(249,115,22,0.35),0_0_0_2px_rgba(249,115,22,0.15)] active:translate-y-0 active:shadow-[0_2px_8px_rgba(249,115,22,0.2)] disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("resetPassword")}
        </button>
      </form>
    </AuthCard>
  );
}
