import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { ParticleCanvas } from "@/components/auth/ParticleCanvas";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0F0F11] px-5 py-[60px]">
      {/* Radial glow at top */}
      <div
        className="pointer-events-none absolute left-1/2 top-[-120px] z-0 h-[500px] w-[700px] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(249,115,22,0.10) 0%, rgba(249,115,22,0.03) 40%, transparent 70%)",
        }}
      />

      {/* Floating orbs */}
      <div className="pointer-events-none absolute left-[-5%] top-[10%] z-0 h-[400px] w-[400px] animate-[float1_20s_ease-in-out_infinite] rounded-full bg-[#F97316] opacity-[0.07] blur-[80px]" />
      <div className="pointer-events-none absolute bottom-[10%] right-[-5%] z-0 h-[350px] w-[350px] animate-[float2_25s_ease-in-out_infinite] rounded-full bg-[#3B82F6] opacity-[0.07] blur-[80px]" />
      <div className="pointer-events-none absolute left-[60%] top-[60%] z-0 h-[250px] w-[250px] animate-[float3_18s_ease-in-out_infinite] rounded-full bg-[#EA580C] opacity-[0.07] blur-[80px]" />

      {/* Particle canvas */}
      <ParticleCanvas />

      {/* Back to home */}
      <Link
        href="/"
        className="absolute left-7 top-7 z-10 flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#27272A] bg-[#18181B] text-[#A1A1AA] transition-all hover:border-[#3F3F46] hover:bg-[#1C1C1F] hover:text-[#FAFAFA]"
      >
        <ArrowLeft className="h-[18px] w-[18px]" />
      </Link>

      {/* Card + trust badges container */}
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}
