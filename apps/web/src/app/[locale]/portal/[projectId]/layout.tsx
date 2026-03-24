import { ReactNode } from "react";

export const metadata = {
  title: "Cantaia — Portail chantier",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark min-h-screen bg-[#0F0F11] text-[#FAFAFA]">
      {children}
    </div>
  );
}
