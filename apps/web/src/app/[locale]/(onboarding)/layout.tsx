import { AuthProvider } from "@/components/providers/AuthProvider";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-50">
        {children}
      </div>
    </AuthProvider>
  );
}
