"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Dashboard page — redirects to /mail (the active product).
 * Kept as a redirect to avoid 404 for users with bookmarks.
 */
export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/mail");
  }, [router]);

  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );
}
