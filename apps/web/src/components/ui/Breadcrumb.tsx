"use client";

import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-[#71717A] mb-4">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1.5">
          {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          {item.href ? (
            <Link href={item.href} className="hover:text-[#F97316] transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-[#FAFAFA] font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
