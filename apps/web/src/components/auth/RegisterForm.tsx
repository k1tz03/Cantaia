"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@cantaia/core/models";
import { registerAction } from "@/app/[locale]/(auth)/actions";
import { useState, useEffect, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, Building2, AlertTriangle } from "lucide-react";

interface InviteData {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  organization: {
    id: string;
    name: string;
    display_name?: string;
  };
}

export function RegisterForm() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const prefillEmail = searchParams.get("email") || "";
  const inviteToken = searchParams.get("invite_token") || "";
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: prefillEmail,
      role: "project_manager",
    },
  });

  // Validate invite token on mount
  useEffect(() => {
    if (!inviteToken) return;

    async function validateInvite() {
      try {
        const res = await fetch(`/api/invites?token=${encodeURIComponent(inviteToken)}`);
        const data = await res.json();

        if (data.valid && data.invite) {
          const invite = data.invite;
          setInviteData({
            email: invite.email,
            first_name: invite.first_name || "",
            last_name: invite.last_name || "",
            role: invite.role || "project_manager",
            organization: invite.organization,
          });

          // Pre-fill form fields
          if (invite.email) setValue("email", invite.email);
          if (invite.first_name) setValue("first_name", invite.first_name);
          if (invite.last_name) setValue("last_name", invite.last_name);
          if (invite.role) setValue("role", invite.role);
          // Set company_name to org name to satisfy Zod validation (field is hidden)
          if (invite.organization?.name) {
            setValue("company_name", invite.organization.name);
          }
        } else {
          setInviteError(data.reason || "invalid");
        }
      } catch {
        setInviteError("network");
      } finally {
        setInviteLoading(false);
      }
    }

    validateInvite();
  }, [inviteToken, setValue]);

  const onSubmit = (data: RegisterInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await registerAction({
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
        company_name: data.company_name,
        role: data.role,
        invite_token: inviteToken || undefined,
      });
      if (result.error) {
        setServerError(result.error);
      } else if (result.success) {
        setSuccess(true);
      }
    });
  };

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-[10px] border border-[#22C55E]/30 bg-[#22C55E]/10 p-4">
          <p className="text-sm text-[#22C55E]">
            {t("registerSuccess")}
          </p>
        </div>
        <Link
          href="/login"
          className="inline-block text-sm font-semibold text-[#F97316] hover:text-[#FB923C] hover:underline"
        >
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  if (inviteLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
        <p className="text-sm text-[#A1A1AA]">{t("inviteLoading")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Invite banner */}
      {inviteData && (
        <div className="mb-4 flex items-center gap-3 rounded-[10px] border border-[#22C55E]/30 bg-[#22C55E]/10 px-4 py-3">
          <Building2 className="h-5 w-5 shrink-0 text-[#22C55E]" />
          <p className="text-sm text-[#22C55E]">
            {t("joiningOrg")}{" "}
            <span className="font-semibold">
              {inviteData.organization.display_name || inviteData.organization.name}
            </span>
          </p>
        </div>
      )}

      {/* Invite error banner */}
      {inviteError && (
        <div className="mb-4 flex items-center gap-3 rounded-[10px] border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[#F59E0B]" />
          <p className="text-sm text-[#F59E0B]">{t("inviteExpired")}</p>
        </div>
      )}

      {serverError && (
        <div className="mb-4 rounded-[10px] border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#EF4444]">
          {serverError}
        </div>
      )}

      {/* First + Last name */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="first_name"
            className="mb-1.5 block text-[13px] font-medium text-[#A1A1AA]"
          >
            {t("firstName")}
          </label>
          <input
            {...register("first_name")}
            type="text"
            id="first_name"
            autoComplete="given-name"
            placeholder="Jean"
            className="h-[46px] w-full rounded-[10px] border border-[#27272A] bg-[#1C1C1F] px-4 text-sm text-[#FAFAFA] placeholder-[#52525B] outline-none transition-all focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)]"
          />
          {errors.first_name && (
            <p className="mt-1 text-xs text-[#EF4444]">
              {errors.first_name.message}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="last_name"
            className="mb-1.5 block text-[13px] font-medium text-[#A1A1AA]"
          >
            {t("lastName")}
          </label>
          <input
            {...register("last_name")}
            type="text"
            id="last_name"
            autoComplete="family-name"
            placeholder="Dupont"
            className="h-[46px] w-full rounded-[10px] border border-[#27272A] bg-[#1C1C1F] px-4 text-sm text-[#FAFAFA] placeholder-[#52525B] outline-none transition-all focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)]"
          />
          {errors.last_name && (
            <p className="mt-1 text-xs text-[#EF4444]">
              {errors.last_name.message}
            </p>
          )}
        </div>
      </div>

      {/* Email */}
      <div className="mb-4">
        <label
          htmlFor="reg-email"
          className="mb-1.5 block text-[13px] font-medium text-[#A1A1AA]"
        >
          {t("email")}
        </label>
        <input
          {...register("email")}
          type="email"
          id="reg-email"
          autoComplete="email"
          readOnly={!!inviteData}
          placeholder="votre@email.ch"
          className={`h-[46px] w-full rounded-[10px] border border-[#27272A] bg-[#1C1C1F] px-4 text-sm text-[#FAFAFA] placeholder-[#52525B] outline-none transition-all focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)] ${inviteData ? "cursor-not-allowed opacity-60" : ""}`}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-[#EF4444]">{errors.email.message}</p>
        )}
      </div>

      {/* Password */}
      <div className="mb-4">
        <label
          htmlFor="reg-password"
          className="mb-1.5 block text-[13px] font-medium text-[#A1A1AA]"
        >
          {t("password")}
        </label>
        <div className="relative">
          <input
            {...register("password")}
            type={showPassword ? "text" : "password"}
            id="reg-password"
            autoComplete="new-password"
            placeholder="Min. 8 caractères"
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

      {/* Company name — hidden when joining via invite */}
      {!inviteData && (
        <div className="mb-6">
          <label
            htmlFor="company_name"
            className="mb-1.5 block text-[13px] font-medium text-[#A1A1AA]"
          >
            {t("companyName")}
          </label>
          <input
            {...register("company_name")}
            type="text"
            id="company_name"
            autoComplete="organization"
            placeholder="Votre entreprise SA"
            className="h-[46px] w-full rounded-[10px] border border-[#27272A] bg-[#1C1C1F] px-4 text-sm text-[#FAFAFA] placeholder-[#52525B] outline-none transition-all focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)]"
          />
          {errors.company_name && (
            <p className="mt-1 text-xs text-[#EF4444]">
              {errors.company_name.message}
            </p>
          )}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="flex h-[50px] w-full items-center justify-center rounded-[14px] bg-gradient-to-r from-[#F97316] to-[#EA580C] font-display text-[15px] font-bold tracking-[0.01em] text-white shadow-[0_2px_12px_rgba(249,115,22,0.25)] transition-all hover:-translate-y-px hover:shadow-[0_4px_24px_rgba(249,115,22,0.35),0_0_0_2px_rgba(249,115,22,0.15)] active:translate-y-0 active:shadow-[0_2px_8px_rgba(249,115,22,0.2)] disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("startFreeTrial")}
      </button>

      {/* Trial note */}
      <p className="mt-4 text-center text-xs leading-relaxed text-[#71717A]">
        {t("trialInfo")}
      </p>

      {/* Login link */}
      <p className="mt-6 text-center text-sm text-[#A1A1AA]">
        {t("alreadyHaveAccount")}{" "}
        <Link
          href="/login"
          className="font-semibold text-[#F97316] transition-colors hover:text-[#FB923C] hover:underline"
        >
          {t("login")}
        </Link>
      </p>
    </form>
  );
}
