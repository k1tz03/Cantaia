"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useActiveProjectSafe } from "@/lib/contexts/active-project-context";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Bell, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

function getPageName(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  // Remove locale
  if (segments[0]?.length === 2) segments.shift();
  const page = segments[0] || "dashboard";

  const names: Record<string, string> = {
    dashboard: "Dashboard",
    mail: "Mail",
    briefing: "Briefing",
    tasks: "Tâches",
    suppliers: "Fournisseurs",
    "cantaia-prix": "Cantaia Prix",
    "site-reports": "Rapports chantier",
    chat: "Assistant IA",
    projects: "Projets",
    submissions: "Soumissions",
    plans: "Plans",
    settings: "Paramètres",
    support: "Support",
    admin: "Administration",
    direction: "Direction",
    "pv-chantier": "PV Chantier",
    visits: "Visites",
    "pricing-intelligence": "Prix",
    meetings: "Réunions",
    "super-admin": "Super Admin",
  };
  return names[page] || page;
}

export function AppHeader() {
  const { user } = useAuth();
  const { activeProject } = useActiveProjectSafe();
  const pathname = usePathname();
  const pageName = getPageName(pathname);
  const [orgName, setOrgName] = useState<string | null>(null);

  const initials =
    user?.user_metadata?.first_name && user?.user_metadata?.last_name
      ? `${user.user_metadata.first_name[0]}${user.user_metadata.last_name[0]}`.toUpperCase()
      : user?.email?.[0]?.toUpperCase() || "?";

  // Fetch org name once
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      try {
        const { data: profile } = await (supabase.from("users") as any)
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.organization_id) {
          const { data: org } = await (supabase.from("organizations") as any)
            .select("name")
            .eq("id", profile.organization_id)
            .maybeSingle();
          if (org?.name) setOrgName(org.name);
        }
      } catch {
        // Silently ignore
      }
    })();
  }, [user]);

  return (
    <header className="h-12 bg-[#09090B] border-b border-[#27272A] flex items-center px-5 z-20 flex-shrink-0">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
        <div className="w-[26px] h-[26px] bg-logo rounded-[6px] flex items-center justify-center text-[13px] text-white font-extrabold font-display">
          C
        </div>
        <span className="font-display font-extrabold text-[15px] text-[#FAFAFA] hidden sm:block">
          Cantaia
        </span>
      </Link>

      {/* Breadcrumb */}
      <div className="text-[13px] text-[#71717A] ml-5 hidden md:flex items-center gap-1">
        {orgName && <span>{orgName}</span>}
        {orgName && <span className="mx-1">&rsaquo;</span>}
        {activeProject && (
          <>
            <Link
              href={`/projects/${activeProject.id}`}
              className="text-[#F97316] hover:underline"
            >
              {activeProject.name}
            </Link>
            <span className="mx-1">&rsaquo;</span>
          </>
        )}
        <span className="text-[#D4D4D8] font-medium">{pageName}</span>
      </div>

      {/* Right section */}
      <div className="ml-auto flex items-center gap-3">
        {/* Search */}
        <div className="hidden md:flex items-center gap-2 bg-[#18181B] border border-[#3F3F46] rounded-lg px-3 py-1.5 w-[200px] cursor-pointer hover:border-[#52525B] transition-colors">
          <Search className="h-3.5 w-3.5 text-[#71717A]" />
          <span className="text-[12px] text-[#71717A] flex-1">
            Rechercher...
          </span>
          <kbd className="text-[9px] text-[#52525B] bg-[#27272A] px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </div>

        {/* Notifications */}
        <button className="w-8 h-8 rounded-lg bg-[#18181B] border border-[#3F3F46] flex items-center justify-center hover:bg-[#27272A] transition-colors relative">
          <Bell className="h-3.5 w-3.5 text-[#A1A1AA]" />
          <span className="absolute top-[5px] right-[5px] w-[6px] h-[6px] bg-[#EF4444] rounded-full" />
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-lg bg-logo flex items-center justify-center text-[11px] text-white font-semibold cursor-pointer">
          {initials}
        </div>
      </div>
    </header>
  );
}
