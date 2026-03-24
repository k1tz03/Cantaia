"use client";

import { Loader2, Check } from "lucide-react";

interface SaveButtonProps {
  isDirty: boolean;
  saving: boolean;
  showSaved: boolean;
  error?: string | null;
  onClick: () => void;
  label: string;
  savedLabel?: string;
}

export function SaveButton({
  isDirty,
  saving,
  showSaved,
  error,
  onClick,
  label,
  savedLabel = "Enregistr\u00e9",
}: SaveButtonProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={!isDirty || saving}
        className={`inline-flex items-center gap-2 rounded-lg px-6 py-[9px] text-[13px] font-semibold text-white transition-opacity disabled:opacity-50 ${
          isDirty
            ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:opacity-90 cursor-pointer"
            : "bg-[#27272A] cursor-not-allowed"
        }`}
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </button>
      {showSaved && (
        <span className="flex items-center gap-1 text-[11px] text-[#34D399]">
          <Check className="h-3.5 w-3.5" />
          {savedLabel}
        </span>
      )}
      {error && (
        <span className="text-[11px] text-[#F87171]">{error}</span>
      )}
    </div>
  );
}
