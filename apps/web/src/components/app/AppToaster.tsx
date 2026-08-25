"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";

/**
 * Toaster wired to the app theme.
 *
 * Bottom-centre so toasts read as app-level feedback rather than something
 * tucked into a corner; the vertical offset is raised on small screens in
 * globals.css so a toast never sits under the mobile bottom navigation.
 */
export function AppToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      position="bottom-center"
      richColors
      closeButton
      theme={resolvedTheme === "light" ? "light" : "dark"}
    />
  );
}
