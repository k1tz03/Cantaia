"use client";

import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateUserSchema, type UpdateUserInput } from "@cantaia/core/models";
import { updateProfileAction } from "@/app/[locale]/(app)/settings/actions";
import { useAuth } from "@/components/providers/AuthProvider";
import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { Loader2, Camera, Check, FileSignature, Eye, EyeOff } from "lucide-react";

export function ProfileForm() {
  const t = useTranslations("settings");
  const tAuth = useTranslations("auth");
  const { user } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const initialValues = useRef<UpdateUserInput | null>(null);

  // Signature state (managed separately from react-hook-form for rich editing)
  const [signature, setSignature] = useState("");
  const [initialSignature, setInitialSignature] = useState("");
  const [showSignaturePreview, setShowSignaturePreview] = useState(false);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureSaved, setSignatureSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
  });

  // Watch all fields for dirty detection
  const watchedFields = watch();

  useEffect(() => {
    if (user) {
      // Set initial values from user_metadata (may be incomplete for Microsoft OAuth)
      const metaValues: UpdateUserInput = {
        first_name: user.user_metadata?.first_name || "",
        last_name: user.user_metadata?.last_name || "",
        phone: user.user_metadata?.phone || "",
        preferred_language: user.user_metadata?.preferred_language || "fr",
      };
      initialValues.current = metaValues;
      reset(metaValues);

      // Always fetch from DB to fill in gaps (user_metadata may be incomplete)
      fetch("/api/user/profile")
        .then((r) => r.json())
        .then((data) => {
          if (data.profile) {
            const dbValues: UpdateUserInput = {
              first_name: data.profile.first_name || metaValues.first_name,
              last_name: data.profile.last_name || metaValues.last_name,
              phone: data.profile.phone || metaValues.phone,
              preferred_language: data.profile.preferred_language || metaValues.preferred_language,
            };
            // Only update if DB has more data than metadata
            if (dbValues.first_name || dbValues.last_name) {
              initialValues.current = dbValues;
              reset(dbValues);
            }
            // Load signature
            if (data.profile.email_signature !== undefined) {
              setSignature(data.profile.email_signature || "");
              setInitialSignature(data.profile.email_signature || "");
            }
          }
        })
        .catch(() => {});
    }
  }, [user, reset]);

  // Track dirty state
  useEffect(() => {
    if (!initialValues.current) return;
    const changed =
      watchedFields.first_name !== initialValues.current.first_name ||
      watchedFields.last_name !== initialValues.current.last_name ||
      watchedFields.phone !== initialValues.current.phone ||
      watchedFields.preferred_language !== initialValues.current.preferred_language;
    setIsDirty(changed);
  }, [watchedFields]);

  const onSubmit = (data: UpdateUserInput) => {
    setToast(null);
    startTransition(async () => {
      const result = await updateProfileAction(data);
      if (result.error) {
        setToast({ type: "error", text: t("saveError") });
      } else {
        setToast({ type: "success", text: t("savedSuccessfully") });
        initialValues.current = data;
        setIsDirty(false);
      }
      setTimeout(() => setToast(null), 4000);
    });
  };

  const signatureDirty = signature !== initialSignature;

  const handleSaveSignature = useCallback(async () => {
    setSignatureSaving(true);
    setSignatureSaved(false);
    try {
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_signature: signature }),
      });
      if (res.ok) {
        setInitialSignature(signature);
        setSignatureSaved(true);
        setTimeout(() => setSignatureSaved(false), 3000);
      }
    } catch { /* ignore */ }
    setSignatureSaving(false);
  }, [signature]);

  const userEmail = user?.email || "";
  const firstName = watchedFields.first_name || "";
  const lastName = watchedFields.last_name || "";
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "?";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Toast notification */}
      {toast && (
        <div
          className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
            toast.type === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {toast.type === "success" && <Check className="h-4 w-4" />}
          {toast.text}
        </div>
      )}

      {/* Avatar section */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F97316] text-xl font-bold text-white">
          {initials}
        </div>
        <div>
          <p className="text-sm font-medium text-[#FAFAFA]">
            {t("profilePhoto")}
          </p>
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-[#3F3F46] bg-[#27272A] px-3 py-1.5 text-xs font-medium text-[#71717A] hover:bg-[#1C1C1F]"
          >
            <Camera className="h-3.5 w-3.5" />
            {t("changePhoto")}
          </button>
        </div>
      </div>

      {/* Row 1: Prénom | Nom */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="first_name"
            className="block text-sm font-medium text-[#FAFAFA]"
          >
            {tAuth("firstName")}
          </label>
          <input
            {...register("first_name")}
            type="text"
            id="first_name"
            className="mt-1 block w-full rounded-lg border border-[#3F3F46] bg-[#18181B] px-3 py-2.5 text-sm text-[#D4D4D8] placeholder-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
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
            className="block text-sm font-medium text-[#FAFAFA]"
          >
            {tAuth("lastName")}
          </label>
          <input
            {...register("last_name")}
            type="text"
            id="last_name"
            className="mt-1 block w-full rounded-lg border border-[#3F3F46] bg-[#18181B] px-3 py-2.5 text-sm text-[#D4D4D8] placeholder-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
          />
          {errors.last_name && (
            <p className="mt-1 text-xs text-red-500">
              {errors.last_name.message}
            </p>
          )}
        </div>
      </div>

      {/* Row 2: Téléphone | Email (read-only) */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-[#FAFAFA]"
          >
            {t("phone")}
          </label>
          <input
            {...register("phone")}
            type="tel"
            id="phone"
            className="mt-1 block w-full rounded-lg border border-[#3F3F46] bg-[#18181B] px-3 py-2.5 text-sm text-[#D4D4D8] placeholder-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#FAFAFA]">
            {tAuth("email")}
          </label>
          <input
            type="email"
            value={userEmail}
            readOnly
            className="mt-1 block w-full cursor-not-allowed rounded-lg border border-[#27272A] bg-[#27272A] px-3 py-2.5 text-sm text-[#71717A]"
          />
          <p className="mt-1 text-xs text-[#71717A]">{t("emailReadOnly")}</p>
        </div>
      </div>

      {/* Langue */}
      <div>
        <label
          htmlFor="preferred_language"
          className="block text-sm font-medium text-[#FAFAFA]"
        >
          {t("language")}
        </label>
        <select
          {...register("preferred_language")}
          id="preferred_language"
          className="mt-1 block w-full rounded-lg border border-[#3F3F46] bg-[#18181B] px-3 py-2.5 text-sm text-[#D4D4D8] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
        >
          <option value="fr">Fran&ccedil;ais</option>
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </div>

      {/* Save button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending || !isDirty}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
            isDirty
              ? "bg-[#F97316] hover:bg-[#EA580C]"
              : "bg-[#27272A] cursor-not-allowed"
          }`}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("saveChanges")}
        </button>
      </div>

      {/* ─── Email Signature ─── */}
      <div className="border-t border-[#27272A] pt-6 mt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileSignature className="h-4.5 w-4.5 text-[#F97316]" />
            <h3 className="text-sm font-semibold text-[#FAFAFA]">Signature email</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowSignaturePreview(!showSignaturePreview)}
            className="flex items-center gap-1.5 text-xs text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            {showSignaturePreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showSignaturePreview ? "Masquer aperçu" : "Voir aperçu"}
          </button>
        </div>
        <p className="text-xs text-[#71717A] mb-3">
          Cette signature sera automatiquement ajoutée à tous vos emails sortants (composition, réponse, demandes de prix).
        </p>

        <textarea
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder={"Cordialement,\nJulien Ray\nChef de projet\n+41 79 123 45 67"}
          rows={6}
          className="block w-full rounded-lg border border-[#3F3F46] bg-[#18181B] px-3 py-2.5 text-sm text-[#D4D4D8] placeholder-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316] font-mono"
        />

        {showSignaturePreview && signature && (
          <div className="mt-3 rounded-lg border border-[#27272A] bg-[#0F0F11] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#52525B] mb-2">Aperçu dans l&apos;email</p>
            <div className="border-t border-[#27272A] pt-3">
              <div
                className="text-sm text-[#A1A1AA] whitespace-pre-wrap"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {signature}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={handleSaveSignature}
            disabled={signatureSaving || !signatureDirty}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
              signatureDirty
                ? "bg-[#F97316] hover:bg-[#EA580C]"
                : "bg-[#27272A] cursor-not-allowed"
            }`}
          >
            {signatureSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enregistrer la signature
          </button>
          {signatureSaved && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Check className="h-3.5 w-3.5" /> Signature enregistrée
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
