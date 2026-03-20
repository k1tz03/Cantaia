"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Search, FolderKanban } from "lucide-react";
import { useActiveProject } from "@/lib/contexts/active-project-context";
import { Link } from "@/i18n/navigation";

interface ProjectListItem {
  id: string;
  name: string;
  color: string | null;
  updated_at: string;
}

export function ProjectSwitcher() {
  const t = useTranslations("nav");
  const { activeProject, setActiveProject } = useActiveProject();
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects/list");
      if (res.ok) {
        const data = await res.json();
        const sorted = (data.projects || [])
          .sort(
            (a: ProjectListItem, b: ProjectListItem) =>
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )
          .slice(0, 5);
        setProjects(sorted);
      }
    } catch (err) {
      console.error("[ProjectSwitcher] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      setSearch("");
    }
  }, [isOpen, fetchProjects]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-project-switcher]")) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const filteredProjects = search
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    : projects;

  const handleSelect = (projectId: string) => {
    setActiveProject(projectId);
    setIsOpen(false);
  };

  if (!activeProject) {
    return (
      <div data-project-switcher className="px-3 py-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
        >
          <FolderKanban className="h-4 w-4" />
          <span>{t("selectProject")}</span>
          <ChevronDown className="ml-auto h-3 w-3" />
        </button>
        {isOpen && (
          <ProjectDropdown
            projects={filteredProjects}
            search={search}
            onSearch={setSearch}
            onSelect={handleSelect}
            loading={loading}
            t={t}
          />
        )}
      </div>
    );
  }

  return (
    <div data-project-switcher className="px-3 py-2 relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent"
      >
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: activeProject.color || "#2563EB" }}
        />
        <span className="truncate">{activeProject.name}</span>
        <ChevronDown
          className={`ml-auto h-3 w-3 shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && (
        <ProjectDropdown
          projects={filteredProjects}
          search={search}
          onSearch={setSearch}
          onSelect={handleSelect}
          activeId={activeProject.id}
          loading={loading}
          t={t}
        />
      )}
    </div>
  );
}

function ProjectDropdown({
  projects,
  search,
  onSearch,
  onSelect,
  activeId,
  loading,
  t,
}: {
  projects: ProjectListItem[];
  search: string;
  onSearch: (v: string) => void;
  onSelect: (id: string) => void;
  activeId?: string;
  loading: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-md border bg-popover shadow-md">
      <div className="p-2">
        <div className="flex items-center gap-2 rounded-md border px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("projectSearch")}
            className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-[200px] overflow-y-auto px-1 pb-2">
        {loading ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">...</p>
        ) : projects.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {t("selectProject")}
          </p>
        ) : (
          projects.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm hover:bg-accent ${
                p.id === activeId ? "bg-accent font-medium" : ""
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: p.color || "#2563EB" }}
              />
              <span className="truncate">{p.name}</span>
            </button>
          ))
        )}
      </div>
      <div className="border-t px-1 py-1">
        <Link
          href="/projects"
          className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
        >
          <FolderKanban className="h-3 w-3" />
          {t("seeAll")}
        </Link>
      </div>
    </div>
  );
}
