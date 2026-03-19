"use client";

import { AlertTriangle } from "lucide-react";

interface ImpersonationBannerProps {
  userName: string;
  returnUrl: string;
}

export function ImpersonationBanner({
  userName,
  returnUrl,
}: ImpersonationBannerProps) {
  return (
    <div className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-between bg-red-600 px-4 py-2 text-sm text-white">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>
          Vous etes connecte en tant que <strong>{userName}</strong>
        </span>
      </div>
      <a
        href={returnUrl}
        className="font-medium underline hover:no-underline"
      >
        Retour super-admin
      </a>
    </div>
  );
}
