"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useActiveProjectSafe } from "@/lib/contexts/active-project-context";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Search, User, Shield, LogOut } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { NotificationDropdown } from "./NotificationDropdown";

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
  const { user, signOut } = useAuth();
  const { activeProject } = useActiveProjectSafe();
  const pathname = usePathname();
  const router = useRouter();
  const pageName = getPageName(pathname);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

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

  // Close avatar dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    }
    if (avatarOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [avatarOpen]);

  const openCommandPalette = () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  };

  const handleSignOut = async () => {
    setAvatarOpen(false);
    await signOut();
    router.push("/login");
  };

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
        {/* Search — triggers CommandPalette */}
        <div
          role="button"
          tabIndex={0}
          onClick={openCommandPalette}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openCommandPalette(); }}
          data-tour="header-search"
          className="hidden md:flex items-center gap-2 bg-[#18181B] border border-[#3F3F46] rounded-lg px-3 py-1.5 w-[200px] cursor-pointer hover:border-[#52525B] transition-colors"
        >
          <Search className="h-3.5 w-3.5 text-[#71717A]" />
          <span className="text-[12px] text-[#71717A] flex-1">
            Rechercher...
          </span>
          <kbd className="text-[9px] text-[#52525B] bg-[#27272A] px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </div>

        {/* Notifications dropdown */}
        <NotificationDropdown />

        {/* Avatar dropdown */}
        <div className="relative" ref={avatarRef}>
          <button
            onClick={() => setAvatarOpen((v) => !v)}
            className="w-8 h-8 rounded-lg bg-logo flex items-center justify-center text-[11px] text-white font-semibold cursor-pointer"
          >
            {initials}
          </button>

          {avatarOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-[#18181B] border border-[#3F3F46] rounded-lg shadow-xl shadow-black/40 py-1 z-50">
              <Link
                href="/settings"
                onClick={() => setAvatarOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-[13px] text-[#D4D4D8] hover:bg-[#27272A] transition-colors"
              >
                <User className="h-3.5 w-3.5 text-[#A1A1AA]" />
                Profil
              </Link>
              <Link
                href="/admin"
                onClick={() => setAvatarOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-[13px] text-[#D4D4D8] hover:bg-[#27272A] transition-colors"
              >
                <Shield className="h-3.5 w-3.5 text-[#A1A1AA]" />
                Administration
              </Link>
              <hr className="my-1 border-[#27272A]" />
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-3 py-2 text-[13px] text-[#EF4444] hover:bg-[#27272A] transition-colors w-full text-left"
              >
                <LogOut className="h-3.5 w-3.5" />
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
