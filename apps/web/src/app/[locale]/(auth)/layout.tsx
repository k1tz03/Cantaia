import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { Hazard, RegMarks } from "@/components/chantier/primitives";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark relative min-h-screen overflow-hidden bg-[#0A0A0C] text-[#FAFAFA]">
      {/* Subtle site grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #F97316 1px, transparent 1px), linear-gradient(to bottom, #F97316 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
        aria-hidden
      />

      {/* Top hazard strip */}
      <Hazard height="h-[8px]" />

      {/* Registration marks at viewport corners */}
      <div className="pointer-events-none absolute inset-0">
        <RegMarks blink={false} />
      </div>

      {/* Side-axis vertical label */}
      <div
        className="pointer-events-none absolute left-6 top-1/2 hidden origin-left -translate-y-1/2 -rotate-90 lg:block"
        aria-hidden
      >
        <div className="flex items-center gap-3 font-tech text-[10px] font-bold tracking-[0.36em] text-[#3F3F46]">
          <span>ACCÈS</span>
          <span className="h-px w-10 bg-[#3F3F46]" />
          <span>SÉCURISÉ</span>
          <span className="h-px w-10 bg-[#3F3F46]" />
          <span>CFC·AUTH·001</span>
        </div>
      </div>

      {/* Back-to-home */}
      <Link
        href="/"
        className="absolute left-5 top-6 z-10 inline-flex items-center gap-2.5 border border-[#27272A] bg-[#111114] px-3.5 py-2.5 font-condensed text-[11px] font-700 uppercase tracking-[0.22em] text-[#A1A1AA] transition-colors hover:border-[#F97316] hover:text-[#F97316] lg:left-20"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Retour</span>
      </Link>

      {/* Main content */}
      <main className="relative z-[2] flex min-h-screen items-center justify-center px-5 py-20 lg:px-24">
        {children}
      </main>
    </div>
  );
}
