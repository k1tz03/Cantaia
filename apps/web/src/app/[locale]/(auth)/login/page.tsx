"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { loginSchema, type LoginInput } from "@cantaia/core/models";
import {
  loginAction,
  signInWithGoogleAction,
  signInWithMicrosoftAction,
} from "@/app/[locale]/(auth)/actions";
import {
  Crosshair,
  FicheRow,
  Hazard,
  SitePlacard,
} from "@/components/chantier/primitives";

export default function LoginPage() {
  const t = useTranslations("chantier.login");
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");

  return (
    <div className="grid w-full max-w-[960px] grid-cols-1 gap-5 lg:grid-cols-[1fr_300px] lg:gap-6">
      {/* === MAIN CARD === */}
      <section className="relative">
        <SitePlacard
          lot={t("placard.lot")}
          title={t("placard.title")}
          cfc={t("placard.cfc")}
        />

        <div className="relative border border-t-0 border-[#27272A] bg-[#111114] px-7 py-10 sm:px-12 sm:py-12">
          {/* Giant outlined stamp in background */}
          <div className="pointer-events-none absolute right-4 top-6 select-none sm:right-10 sm:top-10">
            <div
              className="font-condensed font-900 leading-[0.85] tracking-[-0.04em]"
              style={{
                fontSize: "clamp(110px, 14vw, 200px)",
                color: "transparent",
                WebkitTextStroke: "1px rgba(249,115,22,0.22)",
              }}
              aria-hidden
            >
              01
            </div>
          </div>

          {/* Corner registration marks */}
          <div className="pointer-events-none absolute left-3 top-3" aria-hidden>
            <Crosshair size={10} color="#3F3F46" />
          </div>
          <div
            className="pointer-events-none absolute bottom-3 left-3"
            aria-hidden
          >
            <Crosshair size={10} color="#3F3F46" />
          </div>
          <div
            className="pointer-events-none absolute bottom-3 right-3"
            aria-hidden
          >
            <Crosshair size={10} color="#3F3F46" />
          </div>

          {/* Eyebrow */}
          <div className="relative mb-7 flex items-center gap-3">
            <Crosshair />
            <span className="font-tech text-[11px] font-bold tracking-[0.22em] text-[#F97316]">
              {t("eyebrow.label")}
            </span>
            <span className="h-px flex-1 bg-[#27272A]" />
            <span className="font-tech text-[10px] tracking-[0.14em] text-[#52525B]">
              {t("eyebrow.session")}
            </span>
          </div>

          {/* Title */}
          <h1 className="relative font-condensed text-[42px] font-900 uppercase leading-[0.92] tracking-[-0.01em] text-[#FAFAFA] sm:text-[56px]">
            {t("title.line1")}
            <br />
            <span className="text-[#F97316]">{t("title.line2")}</span>
          </h1>
          <p className="relative mt-4 max-w-[460px] font-sans text-[15px] leading-relaxed text-[#A1A1AA]">
            {t("subtitle")}
          </p>

          {/* Callback error (from OAuth redirect) */}
          {callbackError && (
            <div className="relative mt-6 flex items-start gap-3 border border-[#EF4444]/40 bg-[#EF4444]/5 px-4 py-3 font-tech text-[12px] leading-relaxed text-[#EF4444]">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                <span className="font-bold tracking-[0.14em]">{t("errors.authPrefix")}</span>{" "}
                {decodeURIComponent(callbackError)}
              </span>
            </div>
          )}

          {/* SSO block */}
          <div className="relative mt-10">
            <div className="mb-4 flex items-center gap-3">
              <span className="font-tech text-[10px] font-bold tracking-[0.22em] text-[#52525B]">
                {t("sso.label")}
              </span>
              <span className="h-px flex-1 bg-[#27272A]" />
              <span className="font-tech text-[10px] tracking-[0.14em] text-[#3F3F46]">
                {t("sso.providers")}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <MicrosoftButtonChantier />
              <GoogleButtonChantier />
            </div>
          </div>

          {/* Divider */}
          <div className="relative my-8 flex items-center gap-4">
            <span className="h-px flex-1 bg-[#27272A]" />
            <span className="font-tech text-[10px] font-bold tracking-[0.22em] text-[#52525B]">
              {t("divider")}
            </span>
            <span className="h-px flex-1 bg-[#27272A]" />
          </div>

          {/* Credentials form */}
          <CredentialsForm />

          {/* Register link */}
          <div className="relative mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[#27272A] pt-6">
            <span className="font-tech text-[11px] font-semibold tracking-[0.18em] text-[#52525B]">
              {t("register.prompt")}
            </span>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 font-condensed text-[13px] font-800 uppercase tracking-[0.22em] text-[#F97316] transition-colors hover:text-[#EA580C]"
            >
              {t("register.cta")}
              <span className="font-tech text-[11px] opacity-70">→</span>
            </Link>
          </div>
        </div>

        <Hazard height="h-[6px]" />
      </section>

      {/* === SIDE FICHE (desktop only) === */}
      <aside className="hidden lg:block">
        <SitePlacard
          lot={t("fiche.lot")}
          title={t("fiche.title")}
          cfc={t("fiche.cfc")}
        />
        <div className="border border-t-0 border-[#27272A] bg-[#0A0A0C] px-5 py-4">
          <FicheRow k={t("fiche.rows.status.key")} v={t("fiche.rows.status.value")} accent />
          <FicheRow k={t("fiche.rows.encryption.key")} v={t("fiche.rows.encryption.value")} />
          <FicheRow k={t("fiche.rows.region.key")} v={t("fiche.rows.region.value")} />
          <FicheRow k={t("fiche.rows.hosting.key")} v={t("fiche.rows.hosting.value")} />
          <FicheRow k={t("fiche.rows.gdpr.key")} v={t("fiche.rows.gdpr.value")} />
          <FicheRow k={t("fiche.rows.fadp.key")} v={t("fiche.rows.fadp.value")} />
          <FicheRow k={t("fiche.rows.version.key")} v={t("fiche.rows.version.value")} />
        </div>

        <div className="mt-4 border border-[#27272A] bg-[#111114] p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22C55E]" />
            <span className="font-tech text-[10px] font-bold tracking-[0.22em] text-[#A1A1AA]">
              {t("system.label")}
            </span>
          </div>
          <div className="font-condensed text-[14px] font-600 leading-snug text-[#FAFAFA]">
            {t("system.message")}
          </div>
          <div className="mt-3 flex items-center gap-2 font-tech text-[10px] tracking-[0.14em] text-[#52525B]">
            <span>{t("system.incidentLabel")}</span>
            <span className="h-px flex-1 bg-[#27272A]" />
            <span className="text-[#71717A]">{t("system.incidentValue")}</span>
          </div>
        </div>

        <div className="mt-4 border border-[#27272A] bg-[#0A0A0C] p-5">
          <div className="mb-2 font-tech text-[10px] font-bold tracking-[0.22em] text-[#52525B]">
            {t("support.label")}
          </div>
          <div className="font-condensed text-[13px] font-600 leading-snug text-[#FAFAFA]">
            {t("support.message")}
          </div>
          <a
            href="mailto:support@cantaia.io"
            className="mt-3 inline-flex items-center gap-2 font-tech text-[11px] font-bold tracking-[0.18em] text-[#F97316] hover:text-[#EA580C]"
          >
            support@cantaia.io
            <span className="opacity-70">→</span>
          </a>
        </div>
      </aside>
    </div>
  );
}

/* =========================================================
 *  CREDENTIALS FORM
 * ========================================================= */
function CredentialsForm() {
  const t = useTranslations("chantier.login");
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
            setServerError(t("form.errors.invalidCredentials"));
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
        setServerError(t("form.errors.generic"));
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="relative">
      {serverError && (
        <div className="mb-5 flex items-start gap-3 border border-[#EF4444]/40 bg-[#EF4444]/5 px-4 py-3 font-tech text-[12px] leading-relaxed text-[#EF4444]">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            <span className="font-bold tracking-[0.14em]">{t("form.errors.prefix")}</span>{" "}
            {serverError}
          </span>
        </div>
      )}

      {/* Email */}
      <div className="mb-5">
        <label
          htmlFor="email"
          className="mb-2 flex items-center justify-between font-tech text-[10px] font-bold uppercase tracking-[0.22em] text-[#52525B]"
        >
          <span>{t("form.email.label")}</span>
          <span className="text-[#3F3F46]">{t("form.required")}</span>
        </label>
        <input
          {...register("email")}
          type="email"
          id="email"
          autoComplete="email"
          placeholder={t("form.email.placeholder")}
          className="block h-[52px] w-full border border-[#27272A] bg-[#0A0A0C] px-4 font-sans text-[14px] text-[#FAFAFA] placeholder-[#52525B] outline-none transition-all focus:border-[#F97316] focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
        />
        {errors.email && (
          <p className="mt-1.5 font-tech text-[11px] tracking-[0.08em] text-[#EF4444]">
            <span className="font-bold">{t("form.errors.prefix")}</span> {t("form.errors.emailInvalid")}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="mb-3">
        <label
          htmlFor="password"
          className="mb-2 flex items-center justify-between font-tech text-[10px] font-bold uppercase tracking-[0.22em] text-[#52525B]"
        >
          <span>{t("form.password.label")}</span>
          <span className="text-[#3F3F46]">{t("form.required")}</span>
        </label>
        <div className="relative">
          <input
            {...register("password")}
            type={showPassword ? "text" : "password"}
            id="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            className="block h-[52px] w-full border border-[#27272A] bg-[#0A0A0C] px-4 pr-[52px] font-sans text-[14px] text-[#FAFAFA] placeholder-[#52525B] outline-none transition-all focus:border-[#F97316] focus:shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-0 top-0 flex h-[52px] w-[52px] items-center justify-center border-l border-[#27272A] text-[#71717A] transition-colors hover:text-[#F97316]"
            aria-label={
              showPassword
                ? t("form.password.hideAria")
                : t("form.password.showAria")
            }
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1.5 font-tech text-[11px] tracking-[0.08em] text-[#EF4444]">
            <span className="font-bold">{t("form.errors.prefix")}</span> {t("form.errors.passwordMin")}
          </p>
        )}
      </div>

      {/* Forgot password */}
      <div className="mb-6 flex justify-end">
        <Link
          href="/forgot-password"
          className="font-tech text-[11px] font-semibold tracking-[0.14em] text-[#A1A1AA] transition-colors hover:text-[#F97316]"
        >
          {t("form.forgotPassword")}
        </Link>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="group relative flex h-[54px] w-full items-center justify-center gap-3 border border-[#F97316] bg-[#F97316] font-condensed text-[13px] font-800 uppercase tracking-[0.22em] text-[#0A0A0C] transition-colors hover:border-[#EA580C] hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("form.submitting")}</span>
          </>
        ) : (
          <>
            <span>{t("form.submit")}</span>
            <span className="font-tech text-[12px] opacity-70 transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </>
        )}
      </button>
    </form>
  );
}

/* =========================================================
 *  MICROSOFT 365 BUTTON
 * ========================================================= */
function MicrosoftButtonChantier() {
  const t = useTranslations("chantier.login");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    startTransition(async () => {
      const result = await signInWithMicrosoftAction();
      if (result.error) {
        setError(result.error);
      } else if (result.url) {
        window.location.href = result.url;
      }
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="group flex h-[52px] w-full items-center gap-4 border border-[#27272A] bg-[#0A0A0C] px-5 text-left font-condensed text-[12px] font-700 uppercase tracking-[0.22em] text-[#FAFAFA] transition-colors hover:border-[#F97316] disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-[#F97316]" />
        ) : (
          <svg
            className="h-4 w-4 flex-shrink-0"
            viewBox="0 0 21 21"
            fill="none"
            aria-hidden
          >
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
        )}
        <span className="flex-1">{t("sso.microsoft")}</span>
        <span className="font-tech text-[10px] tracking-[0.18em] text-[#52525B] transition-colors group-hover:text-[#F97316]">
          {t("sso.tag")}
        </span>
      </button>
      {error && (
        <p className="mt-2 font-tech text-[11px] tracking-[0.08em] text-[#EF4444]">
          <span className="font-bold">{t("form.errors.prefix")}</span> {error}
        </p>
      )}
    </div>
  );
}

/* =========================================================
 *  GOOGLE BUTTON
 * ========================================================= */
function GoogleButtonChantier() {
  const t = useTranslations("chantier.login");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    startTransition(async () => {
      const result = await signInWithGoogleAction();
      if (result.error) {
        setError(result.error);
      } else if (result.url) {
        window.location.href = result.url;
      }
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="group flex h-[52px] w-full items-center gap-4 border border-[#27272A] bg-[#0A0A0C] px-5 text-left font-condensed text-[12px] font-700 uppercase tracking-[0.22em] text-[#FAFAFA] transition-colors hover:border-[#F97316] disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-[#F97316]" />
        ) : (
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        )}
        <span className="flex-1">{t("sso.google")}</span>
        <span className="font-tech text-[10px] tracking-[0.18em] text-[#52525B] transition-colors group-hover:text-[#F97316]">
          {t("sso.tag")}
        </span>
      </button>
      {error && (
        <p className="mt-2 font-tech text-[11px] tracking-[0.08em] text-[#EF4444]">
          <span className="font-bold">{t("form.errors.prefix")}</span> {error}
        </p>
      )}
    </div>
  );
}
