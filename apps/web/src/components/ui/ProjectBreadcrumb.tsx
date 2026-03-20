"use client";

import { useTranslations } from "next-intl";
import { useActiveProjectSafe } from "@/lib/contexts/active-project-context";
import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";

interface ProjectBreadcrumbProps {
  section?: string;
}

export function ProjectBreadcrumb({ section }: ProjectBreadcrumbProps) {
  const t = useTranslations("breadcrumb");
  const ctx = useActiveProjectSafe();

  if (!ctx?.activeProject) return null;

  const { activeProject } = ctx;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2"
    >
      <Link
        href={`/projects/${activeProject.id}`}
        className="hover:text-blue-600 transition-colors text-blue-600"
      >
        {activeProject.name}
      </Link>
      {section && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground font-medium">{t(section)}</span>
        </>
      )}
    </nav>
  );
}
