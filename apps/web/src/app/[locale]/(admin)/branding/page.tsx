"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect old /branding to /admin/branding */
export default function BrandingRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/branding");
  }, [router]);
  return null;
}
