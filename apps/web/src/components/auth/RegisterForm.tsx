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
        <div className="rounded-lg bg-green-50 p-4">
          <p className="text-sm text-green-700">
            {t("registerSuccess")}
          </p>
        </div>
        <Link
          href="/login"
          className="inline-block text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8]"
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Invite banner */}
      {inviteData && (
        <div className="flex items-center gap-3 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/10 px-4 py-3">
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
        <div className="flex items-center gap-3 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[#F59E0B]" />
          <p className="text-sm text-[#F59E0B]">{t("inviteExpired")}</p>
        </div>
      )}

      {serverError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="first_name"
            className="block text-sm font-medium text-[#374151]"
          >
            {t("firstName")}
          </label>
          <input
            {...register("first_name")}
            type="text"
            id="first_name"
            autoComplete="given-name"
            className="mt-1 block w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
          {errors.first_name && (
            <p className="mt-1 text-xs text-red-500">
              {errors.first_name.message}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="last_name"
            className="block text-sm font-medium text-[#374151]"
          >
            {t("lastName")}
          </label>
          <input
            {...register("last_name")}
            type="text"
            id="last_name"
            autoComplete="family-name"
            className="mt-1 block w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
          {errors.last_name && (
            <p className="mt-1 text-xs text-red-500">
              {errors.last_name.message}
            </p>
          )}
        </div>
      </div>

      {/* Hide company name field when joining via invite */}
      {!inviteData && (
        <div>
          <label
            htmlFor="company_name"
            className="block text-sm font-medium text-[#374151]"
          >
            {t("companyName")}
          </label>
          <input
            {...register("company_name")}
            type="text"
            id="company_name"
            autoComplete="organization"
            className="mt-1 block w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
          {errors.company_name && (
            <p className="mt-1 text-xs text-red-500">
              {errors.company_name.message}
            </p>
          )}
        </div>
      )}

      <div>
        <label
          htmlFor="role"
          className="block text-sm font-medium text-[#374151]"
        >
          {t("role")}
        </label>
        <select
          {...register("role")}
          id="role"
          className="mt-1 block w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2.5 text-sm text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-200"
        >
          <option value="project_manager">
            {t("roleOptions.project_manager")}
          </option>
          <option value="site_manager">
            {t("roleOptions.site_manager")}
          </option>
          <option value="foreman">{t("roleOptions.foreman")}</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="reg-email"
          className="block text-sm font-medium text-[#374151]"
        >
          {t("email")}
        </label>
        <input
          {...register("email")}
          type="email"
          id="reg-email"
          autoComplete="email"
          readOnly={!!inviteData}
          className={`mt-1 block w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-200 ${inviteData ? "bg-[#27272A]/10 cursor-not-allowed" : ""}`}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="reg-password"
          className="block text-sm font-medium text-[#374151]"
        >
          {t("password")}
        </label>
        <div className="relative mt-1">
          <input
            {...register("password")}
            type={showPassword ? "text" : "password"}
            id="reg-password"
            autoComplete="new-password"
            className="block w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 pr-10 text-sm text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-200"
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

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-[#374151]"
        >
          {t("confirmPassword")}
        </label>
        <input
          {...register("confirmPassword")}
          type="password"
          id="confirmPassword"
          autoComplete="new-password"
          className="mt-1 block w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-blue-200"
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-xs text-red-500">
            {t("passwordsMismatch")}
          </p>
        )}
      </div>

      <p className="text-xs text-[#6B7280]">
        {t("termsAgreement")}
      </p>

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("createAccount")}
      </button>

      <p className="text-center text-sm text-[#6B7280]">
        {t("alreadyHaveAccount")}{" "}
        <Link
          href="/login"
          className="font-medium text-[#2563EB] hover:text-[#1D4ED8]"
        >
          {t("login")}
        </Link>
      </p>
    </form>
  );
}
