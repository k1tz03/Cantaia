import { ReactNode } from "react";

export const metadata = {
  title: "Cantaia — Portail chantier",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}
