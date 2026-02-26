import { AuthProvider } from "@/components/providers/AuthProvider";
import { BrandingProvider } from "@/components/providers/BrandingProvider";
import { Sidebar } from "@/components/app/Sidebar";
import { AppEmailProvider } from "@/components/providers/AppEmailProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <BrandingProvider>
        <AppEmailProvider>
          <div className="flex min-h-screen bg-white">
            <Sidebar />
            <main className="flex-1 overflow-auto pb-20 lg:pb-0">
              {children}
            </main>
          </div>
        </AppEmailProvider>
      </BrandingProvider>
    </AuthProvider>
  );
}
