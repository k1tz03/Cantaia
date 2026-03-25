import { AuthProvider } from "@/components/providers/AuthProvider";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="relative min-h-screen overflow-hidden bg-[#0F0F11]">
        {/* Background gradient orbs */}
        <div
          className="pointer-events-none absolute -right-40 -top-40 z-0 h-[600px] w-[600px] animate-pulse rounded-full bg-[#F97316]/5 blur-[150px]"
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-40 z-0 h-[600px] w-[600px] animate-pulse rounded-full bg-[#3B82F6]/5 blur-[150px]"
          style={{ animationDelay: "2s" }}
        />
        <div className="relative z-10">{children}</div>
      </div>
    </AuthProvider>
  );
}
