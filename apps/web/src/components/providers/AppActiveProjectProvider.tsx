"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { ActiveProjectProvider } from "@/lib/contexts/active-project-context";

export function AppActiveProjectProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  return (
    <ActiveProjectProvider userId={user?.id}>
      {children}
    </ActiveProjectProvider>
  );
}
