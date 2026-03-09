"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@cantaia/core/models";
import { loginAction } from "@/app/[locale]/(auth)/actions";
import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export function LoginForm() {
  const t = useTranslations("auth");
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginInput) => {
    setServerError(null);
    startTransition(async () => {
      try {
        const result = await loginAction(data);
        if (result?.error) {
          if (result.error.includes("Invalid login credentials")) {
            setServerError(t("loginError"));
          } else {
            setServerError(result.error);
          }
          return;
        }
        if (result?.redirectTo) {
          window.location.href = result.redirectTo;
          return;
        }
      } catch (err) {
        console.error("[LoginForm] error:", err);
        setServerError(t("loginError"));
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-[#374151]"
        >
          {t("email")}
        </label>
        <input
          {...register("email")}
          type="email"
          id="email"
          autoComplete="email"
          className="mt-1 block w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-200"
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-[#374151]"
        >
          {t("password")}
        </label>
        <div className="relative mt-1">
          <input
            {...register("password")}
            type={showPassword ? "text" : "password"}
            id="password"
            autoComplete="current-password"
            className="block w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 pr-10 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]"
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

      <div className="flex items-center justify-end">
        <Link
          href="/forgot-password"
          className="text-sm text-[#2563EB] hover:text-[#1D4ED8]"
        >
          {t("forgotPassword")}
        </Link>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("login")}
      </button>

      <p className="text-center text-sm text-[#6B7280]">
        {t("noAccount")}{" "}
        <Link
          href="/register"
          className="font-medium text-[#2563EB] hover:text-[#1D4ED8]"
        >
          {t("register")}
        </Link>
      </p>
    </form>
  );
}
