"use client";

import { useTranslations } from "next-intl";
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
          <div className="rounded-lg bg-green-50 p-4">
            <p className="text-sm text-green-700">
              {t("resetPasswordSuccess")}
            </p>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("resetPasswordTitle")}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {serverError}
          </div>
        )}

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700"
          >
            {t("newPassword")}
          </label>
          <div className="relative mt-1">
            <input
              {...register("password")}
              type={showPassword ? "text" : "password"}
              id="password"
              autoComplete="new-password"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-red-500">
              {t("passwordMinLength")}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-slate-700"
          >
            {t("confirmPassword")}
          </label>
          <input
            {...register("confirmPassword")}
            type="password"
            id="confirmPassword"
            autoComplete="new-password"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-500">
              {t("passwordsMismatch")}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-dark disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("resetPassword")}
        </button>
      </form>
    </AuthCard>
  );
}
