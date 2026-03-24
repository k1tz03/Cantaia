import { AuthProvider } from "@/components/providers/AuthProvider";
import { BrandingProvider } from "@/components/providers/BrandingProvider";
import { Sidebar } from "@/components/app/Sidebar";
import { AppEmailProvider } from "@/components/providers/AppEmailProvider";
import { AppActiveProjectProvider } from "@/components/providers/AppActiveProjectProvider";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { OnboardingChecklist } from "@/components/app/OnboardingChecklist";
import { OnboardingGuard } from "@/components/app/OnboardingGuard";
import { TrialGuard } from "@/components/stripe/TrialGuard";
import { AppHeader } from "@/components/app/AppHeader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <BrandingProvider>
        <AppEmailProvider>
          <AppActiveProjectProvider>
            <OnboardingGuard />
            <TrialGuard />
            <div className="flex flex-col h-screen bg-[#0F0F11]">
              <AppHeader />
              <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-auto pb-20 lg:pb-0 bg-[#0F0F11]">
                  {children}
                </main>
              </div>
            </div>
            <CommandPalette />
            <OnboardingChecklist />
          </AppActiveProjectProvider>
        </AppEmailProvider>
      </BrandingProvider>
    </AuthProvider>
  );
}
