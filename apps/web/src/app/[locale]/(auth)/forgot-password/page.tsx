"use client";

import { useTranslations } from "next-intl";
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
          <div className="rounded-lg bg-green-50 p-4">
            <p className="text-sm text-green-700">
              {t("forgotPasswordSuccess")}
            </p>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("forgotPasswordTitle")}>
      <p className="mb-6 text-center text-sm text-slate-500">
        {t("forgotPasswordDescription")}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {serverError}
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700"
          >
            {t("email")}
          </label>
          <input
            {...register("email")}
            type="email"
            id="email"
            autoComplete="email"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-500">
              {errors.email.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-dark disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("sendResetLink")}
        </button>
      </form>
    </AuthCard>
  );
}
