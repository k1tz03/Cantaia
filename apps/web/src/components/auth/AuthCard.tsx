"use client";

import { Building2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { type ReactNode } from "react";

interface AuthCardProps {
  title: string;
  children: ReactNode;
}

export function AuthCard({ title, children }: AuthCardProps) {
  return (
    <div className="w-full max-w-md space-y-8">
      <div className="text-center">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900">
            Cantaia
          </span>
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-slate-900">
          {title}
        </h1>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}
