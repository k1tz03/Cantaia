"use client";

import { useEffect } from "react";

/**
 * Forces dark mode on the <html> element while marketing pages are mounted.
 * Restores the user's theme choice when navigating away.
 */
export function ForceDarkMode() {
  useEffect(() => {
    const html = document.documentElement;
    const previousTheme = html.classList.contains("dark") ? "dark" : "light";

    // Force dark
    html.classList.add("dark");
    html.classList.remove("light");
    html.style.colorScheme = "dark";

    return () => {
      // Restore user preference when leaving marketing pages
      if (previousTheme === "light") {
        html.classList.remove("dark");
        html.classList.add("light");
        html.style.colorScheme = "light";
      }
    };
  }, []);

  return null;
}
