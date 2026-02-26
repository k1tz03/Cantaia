"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface BrandingConfig {
  logoUrl: string | null;
  logoDarkUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  sidebarColor: string;
  accentColor: string;
  customName: string | null;
  faviconUrl: string | null;
  brandingEnabled: boolean;
}

const DEFAULT_BRANDING: BrandingConfig = {
  logoUrl: null,
  logoDarkUrl: null,
  primaryColor: "#1E3A5F",
  secondaryColor: "#3B82F6",
  sidebarColor: "#F8FAFC",
  accentColor: "#F59E0B",
  customName: null,
  faviconUrl: null,
  brandingEnabled: false,
};

interface BrandingContextType {
  branding: BrandingConfig;
  loading: boolean;
  refresh: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: DEFAULT_BRANDING,
  loading: true,
  refresh: async () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  async function fetchBranding() {
    try {
      const res = await fetch("/api/organization/branding");
      if (res.ok) {
        const data = await res.json();
        const b = data.branding;
        if (b) {
          setBranding({
            logoUrl: b.logo_url || null,
            logoDarkUrl: b.logo_dark_url || null,
            primaryColor: b.primary_color || DEFAULT_BRANDING.primaryColor,
            secondaryColor: b.secondary_color || DEFAULT_BRANDING.secondaryColor,
            sidebarColor: b.sidebar_color || DEFAULT_BRANDING.sidebarColor,
            accentColor: b.accent_color || DEFAULT_BRANDING.accentColor,
            customName: b.custom_name || null,
            faviconUrl: b.favicon_url || null,
            brandingEnabled: b.branding_enabled ?? false,
          });
        }
      }
    } catch {
      // Silently fall back to defaults
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBranding();
  }, []);

  // Apply CSS custom properties when branding changes
  useEffect(() => {
    if (!branding.brandingEnabled) {
      // Reset to defaults
      document.documentElement.style.removeProperty("--brand-primary");
      document.documentElement.style.removeProperty("--brand-secondary");
      document.documentElement.style.removeProperty("--brand-sidebar");
      document.documentElement.style.removeProperty("--brand-accent");
      return;
    }

    document.documentElement.style.setProperty("--brand-primary", branding.primaryColor);
    document.documentElement.style.setProperty("--brand-secondary", branding.secondaryColor);
    document.documentElement.style.setProperty("--brand-sidebar", branding.sidebarColor);
    document.documentElement.style.setProperty("--brand-accent", branding.accentColor);
  }, [branding]);

  return (
    <BrandingContext.Provider value={{ branding, loading, refresh: fetchBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
