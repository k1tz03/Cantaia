"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("nav");

  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="text-center p-8 max-w-md">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          {t("errorOccurred")}
        </h2>
        <p className="text-muted-foreground mb-6">
          {error.message || t("errorDefault")}
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors"
        >
          {t("retry")}
        </button>
      </div>
    </div>
  );
}
