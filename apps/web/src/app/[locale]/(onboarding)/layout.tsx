import { AuthProvider } from "@/components/providers/AuthProvider";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[#27272A]">
        {children}
      </div>
    </AuthProvider>
  );
}
