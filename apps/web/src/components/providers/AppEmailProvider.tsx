"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { EmailProvider } from "@/lib/contexts/email-context";

export function AppEmailProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <EmailProvider userId={user?.id}>{children}</EmailProvider>;
}
