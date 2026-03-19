import { AuthProvider } from "@/components/providers/AuthProvider";
import { BrandingProvider } from "@/components/providers/BrandingProvider";
import { Sidebar } from "@/components/app/Sidebar";
import { AppEmailProvider } from "@/components/providers/AppEmailProvider";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { OnboardingChecklist } from "@/components/app/OnboardingChecklist";
import { OnboardingGuard } from "@/components/app/OnboardingGuard";
import { TrialGuard } from "@/components/stripe/TrialGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <BrandingProvider>
        <AppEmailProvider>
          <OnboardingGuard />
          <TrialGuard />
          <div className="flex min-h-screen bg-white">
            <Sidebar />
            <main className="flex-1 overflow-auto pb-20 lg:pb-0">
              {children}
            </main>
          </div>
          <CommandPalette />
          <OnboardingChecklist />
        </AppEmailProvider>
      </BrandingProvider>
    </AuthProvider>
  );
}
