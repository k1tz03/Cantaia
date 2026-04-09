/**
 * Pre-launch teaser page (`/fr/soon`, `/en/soon`, `/de/soon`).
 *
 * Served to every unauthenticated visitor via `middleware.ts`, which
 * rewrites the root `/` and all public marketing paths to this route
 * until launch day (J12 = mercredi 22 avril 2026, 07h00 CEST).
 *
 * Julien retains access to the real homepage via the bypass cookie
 * (set by visiting `cantaia.io/?preview=<CANTAIA_PREVIEW_SECRET>`).
 */

import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import CountdownTeaser from "./countdown-teaser";

// Load the exact fonts the countdown design relies on. Hoisted to module
// level so next/font fingerprints them once (server-hoist-static-io).
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-teaser-sans" });
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
  variable: "--font-teaser-display",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-teaser-mono",
});

export const metadata: Metadata = {
  title: "Cantaia — Lancement imminent",
  description:
    "L'IA au service du chantier suisse. Lancement le mercredi 22 avril 2026 à 07h00. 12 modules, 3 IA, 100% adapté au chantier suisse.",
  openGraph: {
    title: "Cantaia — Lancement imminent",
    description: "12 modules. 3 IA. 100% adapté au chantier suisse.",
    type: "website",
    url: "https://cantaia.io",
  },
  robots: { index: false, follow: false },
};

// Next.js 15 moved themeColor out of `metadata` into a dedicated `viewport`
// export. Keeping them together would emit a deprecation warning at build time.
export const viewport: Viewport = {
  themeColor: "#0F0F11",
};

export default function SoonPage() {
  return (
    <div className={`${inter.variable} ${jakarta.variable} ${mono.variable}`}>
      <CountdownTeaser />
    </div>
  );
}
