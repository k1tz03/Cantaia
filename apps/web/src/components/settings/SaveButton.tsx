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
  savedLabel = "Enregistré",
}: SaveButtonProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={!isDirty || saving}
        className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
          isDirty
            ? "bg-blue-600 hover:bg-blue-700"
            : "cursor-not-allowed bg-gray-300"
        }`}
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </button>
      {showSaved && (
        <span className="flex items-center gap-1 text-sm text-green-600 animate-in fade-in">
          <Check className="h-4 w-4" />
          {savedLabel}
        </span>
      )}
      {error && (
        <span className="text-sm text-red-600">{error}</span>
      )}
    </div>
  );
}
