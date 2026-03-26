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
    <form onSubmit={handleSubmit(onSubmit)}>
      {serverError && (
        <div className="mb-4 rounded-[10px] border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#EF4444]">
          {serverError}
        </div>
      )}

      {/* Email */}
      <div className="mb-4">
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
          <p className="mt-1 text-xs text-[#EF4444]">{errors.email.message}</p>
        )}
      </div>

      {/* Password */}
      <div className="mb-4">
        <label
          htmlFor="password"
          className="mb-1.5 block text-[13px] font-medium text-[#A1A1AA]"
        >
          {t("password")}
        </label>
        <div className="relative">
          <input
            {...register("password")}
            type={showPassword ? "text" : "password"}
            id="password"
            autoComplete="current-password"
            placeholder={t("password")}
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

      {/* Forgot password */}
      <div className="-mt-1 mb-6 flex justify-end">
        <Link
          href="/forgot-password"
          className="text-[13px] font-medium text-[#F97316] transition-colors hover:text-[#FB923C] hover:underline"
        >
          {t("forgotPassword")}
        </Link>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="flex h-[50px] w-full items-center justify-center rounded-[14px] bg-gradient-to-r from-[#F97316] to-[#EA580C] font-display text-[15px] font-bold tracking-[0.01em] text-white shadow-[0_2px_12px_rgba(249,115,22,0.25)] transition-all hover:-translate-y-px hover:shadow-[0_4px_24px_rgba(249,115,22,0.35),0_0_0_2px_rgba(249,115,22,0.15)] active:translate-y-0 active:shadow-[0_2px_8px_rgba(249,115,22,0.2)] disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("login")}
      </button>

      {/* Register link */}
      <p className="mt-6 text-center text-sm text-[#A1A1AA]">
        {t("noAccount")}{" "}
        <Link
          href="/register"
          className="font-semibold text-[#F97316] transition-colors hover:text-[#FB923C] hover:underline"
        >
          {t("createAccount")}
        </Link>
      </p>
    </form>
  );
}
