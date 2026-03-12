import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #0A1F30 1px, transparent 1px),
            linear-gradient(to bottom, #0A1F30 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Back to home */}
      <Link
        href="/"
        className="absolute left-6 top-6 flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-brand"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <div className="relative">{children}</div>
    </div>
  );
}
