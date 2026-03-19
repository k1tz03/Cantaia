"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface UsageLimitBannerProps {
  current: number;
  limit: number;
  plan: string;
}

export function UsageLimitBanner({ current, limit, plan }: UsageLimitBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || limit <= 0) return null;

  const pct = (current / limit) * 100;
  if (pct < 80) return null;

  const isBlocked = pct >= 100;

  return (
    <div
      className={`px-4 py-3 flex items-center justify-between text-sm ${
        isBlocked
          ? "bg-red-50 text-red-800 border-b border-red-200"
          : "bg-amber-50 text-amber-800 border-b border-amber-200"
      }`}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        {isBlocked ? (
          <span>
            Limite IA atteinte ({current}/{limit} appels).{" "}
            <a
              href="/admin?tab=subscription"
              className="underline font-medium"
            >
              Upgradez votre plan
            </a>
          </span>
        ) : (
          <span>
            {Math.round(pct)}% de votre quota IA utilis&eacute; ({current}/
            {limit}).{" "}
            {plan === "trial" && (
              <a
                href="/admin?tab=subscription"
                className="underline font-medium"
              >
                Passer au plan Starter
              </a>
            )}
          </span>
        )}
      </div>
      {!isBlocked && (
        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-amber-100 rounded"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
