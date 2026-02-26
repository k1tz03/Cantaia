"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Organization, OrganizationBranding } from "@cantaia/database";

interface OrganizationContextType {
  organization: Organization | null;
  subdomain: string | null;
  loading: boolean;
  isBranded: boolean;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organization: null,
  subdomain: null,
  loading: true,
  isBranded: false,
});

export function useOrganization() {
  return useContext(OrganizationContext);
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function resolve() {
      try {
        // In dev, read from ?org= query param
        const orgParam = searchParams.get("org");
        // In production, would come from the middleware header — but client-side
        // we detect from window.location.hostname
        let sub = orgParam;
        if (!sub && typeof window !== "undefined") {
          const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "cantaia.ch";
          const host = window.location.hostname;
          if (host.endsWith(`.${baseDomain}`) && !host.startsWith("www.")) {
            sub = host.replace(`.${baseDomain}`, "");
          }
        }

        if (!sub) {
          setLoading(false);
          return;
        }

        setSubdomain(sub);

        // Fetch organization by subdomain
        const supabase = createClient();
        const { data } = await (supabase.from("organizations") as any)
          .select("*")
          .eq("subdomain", sub)
          .maybeSingle();

        if (data) {
          setOrganization(data);

          // Apply branding CSS variables if org has custom branding
          const branding = data.branding as OrganizationBranding | undefined;
          if (branding) {
            const root = document.documentElement;
            if (branding.color_primary) root.style.setProperty("--brand-primary", branding.color_primary);
            if (branding.color_secondary) root.style.setProperty("--brand-secondary", branding.color_secondary);
            if (branding.color_sidebar_bg) root.style.setProperty("--brand-sidebar", branding.color_sidebar_bg);
            if (branding.color_sidebar_text) root.style.setProperty("--brand-sidebar-text", branding.color_sidebar_text);
          }
        }
      } catch (err) {
        console.error("Failed to resolve organization:", err);
      } finally {
        setLoading(false);
      }
    }
    resolve();
  }, [searchParams]);

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        subdomain,
        loading,
        isBranded: !!organization?.branding && Object.keys(organization.branding).length > 0,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}
