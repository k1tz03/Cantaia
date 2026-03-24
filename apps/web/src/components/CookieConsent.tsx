"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const COOKIE_NAME = "cantaia_cookies_consent";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const params = useParams();
  const locale = (params?.locale as string) || "fr";

  useEffect(() => {
    if (!getCookie(COOKIE_NAME)) {
      setVisible(true);
    }
  }, []);

  function handleAccept() {
    setCookie(COOKIE_NAME, "accepted", 365);
    setVisible(false);

    // Enable Sentry now that consent is given
    try {
      import("@sentry/nextjs").then((Sentry) => {
        const client = Sentry.getClient();
        if (client) {
          client.getOptions().enabled = true;
        }
      });
    } catch { /* ignore */ }
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
      <div className="mx-auto flex max-w-3xl items-center gap-4 rounded-xl border border-[#27272A] bg-[#0F0F11] px-5 py-4 shadow-lg">
        <p className="flex-1 text-sm text-[#71717A]">
          Ce site utilise des cookies pour fonctionner et améliorer votre expérience.{" "}
          <a
            href={`/${locale}/legal/privacy`}
            className="font-medium text-[#F97316] underline underline-offset-2 hover:text-[#F97316]/80"
          >
            En savoir plus
          </a>
        </p>
        <button
          onClick={handleAccept}
          className="shrink-0 rounded-lg bg-[#F97316] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#F97316]/90"
        >
          Accepter
        </button>
      </div>
    </div>
  );
}
