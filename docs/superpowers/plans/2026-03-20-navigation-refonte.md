# Refonte Navigation Cantaia — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Cantaia sidebar from 15 flat items to 3 grouped sections (Quotidien, Referentiels, Projet Actif) with smart context switching, adaptive project tools, and breadcrumbs.

**Architecture:** New `ActiveProjectProvider` React context manages project state (persisted in localStorage). The sidebar is rewritten with 3 explicit JSX sections. A new lightweight API endpoint `/api/projects/[id]/nav-counts` feeds the adaptive tool list. Direction page content merges into Dashboard via an "Organisation" tab. Context switching is wired into project-related pages.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (PostgreSQL), Tailwind CSS 3, shadcn/ui, lucide-react, next-intl

**Spec:** `docs/superpowers/specs/2026-03-20-navigation-refonte-design.md`

---

## File Structure

### Files to Create

| File | Responsibility |
|------|---------------|
| `apps/web/src/lib/contexts/active-project-context.tsx` | ActiveProjectProvider logic: state, localStorage sync, nav-counts fetch, refreshCounts() |
| `apps/web/src/components/providers/AppActiveProjectProvider.tsx` | Wrapper that injects userId from AuthProvider |
| `apps/web/src/app/api/projects/[id]/nav-counts/route.ts` | Lightweight API: COUNT(*) per table filtered by project_id |
| `apps/web/src/components/app/ActiveProjectSection.tsx` | Sidebar section: project switcher dropdown + adaptive tool list |
| `apps/web/src/components/app/ProjectSwitcher.tsx` | Dropdown: recent projects list, search, color badges |
| `apps/web/src/components/ui/ProjectBreadcrumb.tsx` | Breadcrumb: reads from ActiveProjectProvider, renders `Project / Section` |
| `apps/web/src/components/app/DashboardOrgView.tsx` | Direction page content extracted as embeddable component |

### Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/components/app/Sidebar.tsx` | Major rewrite: 3 sections, remove flat NavItem loop, integrate ActiveProjectSection |
| `apps/web/src/app/[locale]/(app)/layout.tsx` | Add AppActiveProjectProvider to provider stack |
| `apps/web/src/middleware.ts` | Add `/pv-chantier`, `/chat`, `/cantaia-prix` to protectedPaths |
| `apps/web/messages/fr.json` | Add 21 i18n keys (nav.sections.*, nav.overview, breadcrumb.*, dashboard.*) |
| `apps/web/messages/en.json` | Same 21 keys in English |
| `apps/web/messages/de.json` | Same 21 keys in German |
| `apps/web/src/app/[locale]/(app)/direction/page.tsx` | Replace with redirect to `/dashboard?view=org` |
| `apps/web/src/app/[locale]/(app)/action-board/page.tsx` | Replace with redirect to `/dashboard` |
| `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` | Add "Organisation" tab with Direction content |
| `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx` | Call setActiveProject on mount |
| `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx` | Call setActiveProject from fetched project_id |
| `apps/web/src/app/[locale]/(app)/plans/[id]/page.tsx` | Call setActiveProject from fetched project_id |
| `apps/web/src/app/[locale]/(app)/mail/page.tsx` | Call setActiveProject on email click with project_id |

### Files to Delete

| File | Reason |
|------|--------|
| `apps/web/src/app/api/action-board/route.ts` | Action Board removed, Dashboard has its own data |

---

## Task Dependency Graph

```
Task 1 (i18n keys) ─────────────────────────────────┐
Task 2 (middleware) ─────────────────────────────────┤
Task 3 (nav-counts API) ────────────────────┐       │
Task 4 (ActiveProjectProvider) ─────────────┤       │
                                            ↓       │
Task 5 (ProjectSwitcher) ──────────┐       │       │
                                   ↓       │       │
Task 6 (ActiveProjectSection) ─────┤       │       │
                                   ↓       ↓       ↓
Task 7 (Sidebar rewrite) ──────────────────────────→│
Task 8 (ProjectBreadcrumb) ────────────────────────→│
Task 9 (Context switching + mail) ─────────────────→│
Task 10a (Direction redirect + extract) ───────────→│
Task 10b (Dashboard org tab) ──────────────────────→│ (depends on 10a + 1)
Task 11 (Action Board redirect) ───────────────────→│
Task 12 (Mobile navigation) ───────────────────────→│
```

Tasks 1-4 can run in parallel. Tasks 5-6 depend on Task 4. Task 7 depends on Tasks 1, 5, 6. Tasks 8-12 depend on Task 4. Task 10b depends on Task 10a.

---

## Task 1: i18n Keys

**Files:**
- Modify: `apps/web/messages/fr.json`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/de.json`

- [ ] **Step 1: Add French keys**

In `apps/web/messages/fr.json`, add inside the `"nav"` object:

```json
"sections": {
  "daily": "Quotidien",
  "references": "Référentiels",
  "activeProject": "Projet actif"
},
"assistantAi": "Assistant IA",
"overview": "Aperçu",
"selectProject": "Sélectionnez un projet",
"seeAll": "Voir tout",
"projectSearch": "Rechercher un projet…",
"recentProjects": "Projets récents",
"pvSeance": "PV de séance",
"planning": "Planning"
```

Add a new top-level `"dashboard"` section (or inside existing if present):

```json
"dashboard": {
  "orgView": "Organisation",
  "personalView": "Mon tableau de bord"
}
```

Add a new top-level `"breadcrumb"` section:

```json
"breadcrumb": {
  "tasks": "Tâches",
  "plans": "Plans",
  "submissions": "Soumissions",
  "meetings": "PV de séance",
  "visits": "Visites",
  "emails": "Emails",
  "prix": "Prix",
  "planning": "Planning",
  "overview": "Aperçu"
}
```

- [ ] **Step 2: Add English keys**

Same structure in `apps/web/messages/en.json`:

```json
// nav.sections
"sections": { "daily": "Daily", "references": "References", "activeProject": "Active project" },
"assistantAi": "AI Assistant",
"overview": "Overview",
"selectProject": "Select a project",
"seeAll": "See all",
"projectSearch": "Search project…",
"recentProjects": "Recent projects",
"pvSeance": "Meeting minutes",
"planning": "Planning"

// dashboard
"dashboard": { "orgView": "Organization", "personalView": "My dashboard" }

// breadcrumb
"breadcrumb": { "tasks": "Tasks", "plans": "Plans", "submissions": "Submissions", "meetings": "Meetings", "visits": "Visits", "emails": "Emails", "prix": "Pricing", "planning": "Planning", "overview": "Overview" }
```

- [ ] **Step 3: Add German keys**

Same structure in `apps/web/messages/de.json`:

```json
// nav.sections
"sections": { "daily": "Täglich", "references": "Referenzen", "activeProject": "Aktives Projekt" },
"assistantAi": "KI-Assistent",
"overview": "Übersicht",
"selectProject": "Projekt auswählen",
"seeAll": "Alle anzeigen",
"projectSearch": "Projekt suchen…",
"recentProjects": "Neueste Projekte",
"pvSeance": "Sitzungsprotokoll",
"planning": "Planung"

// dashboard
"dashboard": { "orgView": "Organisation", "personalView": "Mein Dashboard" }

// breadcrumb
"breadcrumb": { "tasks": "Aufgaben", "plans": "Pläne", "submissions": "Submissions", "meetings": "Sitzungen", "visits": "Besuche", "emails": "E-Mails", "prix": "Preise", "planning": "Planung", "overview": "Übersicht" }
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: No i18n key errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/messages/fr.json apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(i18n): add navigation refactor translation keys (FR/EN/DE)"
```

---

## Task 2: Middleware Updates

**Files:**
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Update protectedPaths**

In `apps/web/src/middleware.ts`, find the `protectedPaths` array and add the 3 missing routes:

```typescript
const protectedPaths = [
  "/action-board",
  "/dashboard",
  "/projects",
  "/tasks",
  "/settings",
  "/briefing",
  "/direction",
  "/admin",
  "/super-admin",
  "/submissions",
  "/mail",
  "/pv",
  "/pv-chantier",    // ADD — was missing, page exists and requires auth
  "/suppliers",
  "/plans",
  "/visits",
  "/onboarding",
  "/chat",           // ADD — was missing, page exists and requires auth
  "/cantaia-prix",   // ADD — was missing, page exists and requires auth
];
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "fix(middleware): add missing protected paths for pv-chantier, chat, cantaia-prix"
```

---

## Task 3: API Route `/api/projects/[id]/nav-counts`

**Files:**
- Create: `apps/web/src/app/api/projects/[id]/nav-counts/route.ts`

- [ ] **Step 1: Create the route file**

Create `apps/web/src/app/api/projects/[id]/nav-counts/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  // Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user's organization
  const { data: profile } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // IDOR check: verify project belongs to user's org
  const { data: project } = await admin
    .from("projects")
    .select("id, organization_id")
    .eq("id", projectId)
    .single();

  if (!project || project.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parallel COUNT queries
  const [
    tasksRes,
    plansRes,
    submissionsRes,
    meetingsRes,
    visitsRes,
    emailsRes,
    budgetRes,
  ] = await Promise.all([
    admin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .in("status", ["todo", "in_progress", "waiting"]),
    admin
      .from("plan_registry")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("client_visits" as any)
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("email_records")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .not("budget_estimate", "is", null),
  ]);

  return NextResponse.json({
    task_count: tasksRes.count ?? 0,
    plan_count: plansRes.count ?? 0,
    submission_count: submissionsRes.count ?? 0,
    meeting_count: meetingsRes.count ?? 0,
    visit_count: visitsRes.count ?? 0,
    email_count: emailsRes.count ?? 0,
    has_budget_estimate: (budgetRes.count ?? 0) > 0,
  });
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/projects/\[id\]/nav-counts/route.ts
git commit -m "feat(api): add /api/projects/[id]/nav-counts endpoint for adaptive sidebar"
```

---

## Task 4: ActiveProjectProvider

**Files:**
- Create: `apps/web/src/lib/contexts/active-project-context.tsx`
- Create: `apps/web/src/components/providers/AppActiveProjectProvider.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/layout.tsx`

- [ ] **Step 1: Create the context**

Create `apps/web/src/lib/contexts/active-project-context.tsx`:

```typescript
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "cantaia_active_project_id";

export interface NavCounts {
  task_count: number;
  plan_count: number;
  submission_count: number;
  meeting_count: number;
  visit_count: number;
  email_count: number;
  has_budget_estimate: boolean;
}

export interface ActiveProject {
  id: string;
  name: string;
  color: string | null;
}

export interface ActiveProjectContextType {
  activeProject: ActiveProject | null;
  navCounts: NavCounts | null;
  isLoading: boolean;
  setActiveProject: (projectId: string | null) => void;
  refreshCounts: () => Promise<void>;
}

const ActiveProjectContext = createContext<ActiveProjectContextType>({
  activeProject: null,
  navCounts: null,
  isLoading: false,
  setActiveProject: () => {},
  refreshCounts: async () => {},
});

export function ActiveProjectProvider({
  userId,
  children,
}: {
  userId: string | undefined;
  children: ReactNode;
}) {
  const [activeProject, setActiveProjectState] = useState<ActiveProject | null>(null);
  const [navCounts, setNavCounts] = useState<NavCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch project info + nav counts
  const fetchProjectData = useCallback(
    async (projectId: string) => {
      if (!userId) return;
      setIsLoading(true);
      try {
        // Fetch project basic info and nav counts in parallel
        const [projectRes, countsRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/nav-counts`),
        ]);

        if (projectRes.status === 403 || countsRes.status === 403) {
          // Project belongs to another org (multi-tenant switch)
          localStorage.removeItem(STORAGE_KEY);
          setActiveProjectState(null);
          setNavCounts(null);
          return;
        }

        if (!projectRes.ok || !countsRes.ok) {
          // Project deleted or other error
          localStorage.removeItem(STORAGE_KEY);
          setActiveProjectState(null);
          setNavCounts(null);
          return;
        }

        const projectData = await projectRes.json();
        const countsData = await countsRes.json();

        const project = projectData.project || projectData;
        setActiveProjectState({
          id: project.id,
          name: project.name,
          color: project.color || null,
        });
        setNavCounts(countsData);
        localStorage.setItem(STORAGE_KEY, projectId);
      } catch (err) {
        console.error("[ActiveProjectContext] fetch failed:", err);
        localStorage.removeItem(STORAGE_KEY);
        setActiveProjectState(null);
        setNavCounts(null);
      } finally {
        setIsLoading(false);
      }
    },
    [userId]
  );

  // Refresh only the counts (not the project info)
  const refreshCounts = useCallback(async () => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/nav-counts`);
      if (res.ok) {
        const data = await res.json();
        setNavCounts(data);
      }
    } catch (err) {
      console.error("[ActiveProjectContext] refreshCounts failed:", err);
    }
  }, [activeProject]);

  // Public setter
  const setActiveProject = useCallback(
    (projectId: string | null) => {
      if (!projectId) {
        localStorage.removeItem(STORAGE_KEY);
        setActiveProjectState(null);
        setNavCounts(null);
        return;
      }
      // Skip if same project already active
      if (activeProject?.id === projectId) return;
      fetchProjectData(projectId);
    },
    [activeProject?.id, fetchProjectData]
  );

  // Restore from localStorage on mount
  useEffect(() => {
    if (!userId) return;
    const storedId = localStorage.getItem(STORAGE_KEY);
    if (storedId) {
      fetchProjectData(storedId);
    }
  }, [userId, fetchProjectData]);

  // Re-fetch counts on window focus
  useEffect(() => {
    const handleFocus = () => {
      if (activeProject) {
        refreshCounts();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [activeProject, refreshCounts]);

  const value = useMemo<ActiveProjectContextType>(
    () => ({
      activeProject,
      navCounts,
      isLoading,
      setActiveProject,
      refreshCounts,
    }),
    [activeProject, navCounts, isLoading, setActiveProject, refreshCounts]
  );

  return (
    <ActiveProjectContext.Provider value={value}>
      {children}
    </ActiveProjectContext.Provider>
  );
}

export function useActiveProject() {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) {
    throw new Error("useActiveProject must be used within ActiveProjectProvider");
  }
  return ctx;
}

export function useActiveProjectSafe() {
  return useContext(ActiveProjectContext);
}
```

- [ ] **Step 2: Create the wrapper provider**

Create `apps/web/src/components/providers/AppActiveProjectProvider.tsx`:

```typescript
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
```

- [ ] **Step 3: Wire into app layout**

In `apps/web/src/app/[locale]/(app)/layout.tsx`, add the import:

```typescript
import { AppActiveProjectProvider } from "@/components/providers/AppActiveProjectProvider";
```

Then wrap children with `AppActiveProjectProvider` after `AppEmailProvider` and before `OnboardingGuard`:

```tsx
<AuthProvider>
  <BrandingProvider>
    <AppEmailProvider>
      <AppActiveProjectProvider>
        <OnboardingGuard />
        <TrialGuard />
        <div className="flex min-h-screen bg-white">
          <Sidebar />
          <main className="flex-1 overflow-auto pb-20 lg:pb-0">
            {children}
          </main>
        </div>
        <CommandPalette />
        <OnboardingChecklist />
      </AppActiveProjectProvider>
    </AppEmailProvider>
  </BrandingProvider>
</AuthProvider>
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/contexts/active-project-context.tsx apps/web/src/components/providers/AppActiveProjectProvider.tsx apps/web/src/app/\[locale\]/\(app\)/layout.tsx
git commit -m "feat(nav): add ActiveProjectProvider with localStorage persistence and nav-counts"
```

---

## Task 5: ProjectSwitcher Component

**Files:**
- Create: `apps/web/src/components/app/ProjectSwitcher.tsx`

**Dependencies:** Task 4 (ActiveProjectProvider)

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/app/ProjectSwitcher.tsx`:

```typescript
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

  // Close on click outside
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

  // No project selected state
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

```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/app/ProjectSwitcher.tsx
git commit -m "feat(nav): add ProjectSwitcher dropdown component"
```

---

## Task 6: ActiveProjectSection Component

**Files:**
- Create: `apps/web/src/components/app/ActiveProjectSection.tsx`

**Dependencies:** Task 4 (ActiveProjectProvider), Task 5 (ProjectSwitcher)

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/app/ActiveProjectSection.tsx`:

```typescript
"use client";

import { useTranslations } from "next-intl";
import { useActiveProject, type NavCounts } from "@/lib/contexts/active-project-context";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { Link } from "@/i18n/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  CalendarRange,
  Map,
  FileSpreadsheet,
  FileText,
  UserCheck,
  Mail,
  FileStack,
  MoreHorizontal,
} from "lucide-react";

interface ProjectTool {
  key: string;
  tab: string | null; // null = no tab (overview)
  icon: React.ElementType;
  labelKey: string;
  alwaysShow: boolean;
  countKey?: keyof NavCounts;
  conditionKey?: keyof NavCounts;
}

const PROJECT_TOOLS: ProjectTool[] = [
  { key: "overview", tab: null, icon: LayoutDashboard, labelKey: "overview", alwaysShow: true },
  { key: "tasks", tab: "tasks", icon: CheckSquare, labelKey: "tasks", alwaysShow: true, countKey: "task_count" },
  { key: "planning", tab: "planning", icon: CalendarRange, labelKey: "planning", alwaysShow: true },
  { key: "plans", tab: "plans", icon: Map, labelKey: "plans", alwaysShow: false, countKey: "plan_count", conditionKey: "plan_count" },
  { key: "submissions", tab: "submissions", icon: FileSpreadsheet, labelKey: "submissions", alwaysShow: false, countKey: "submission_count", conditionKey: "submission_count" },
  { key: "meetings", tab: "meetings", icon: FileText, labelKey: "pvSeance", alwaysShow: false, countKey: "meeting_count", conditionKey: "meeting_count" },
  { key: "visits", tab: "visits", icon: UserCheck, labelKey: "visits", alwaysShow: false, countKey: "visit_count", conditionKey: "visit_count" },
  { key: "emails", tab: "emails", icon: Mail, labelKey: "emails", alwaysShow: false, countKey: "email_count", conditionKey: "email_count" },
  { key: "prix", tab: "prix", icon: FileStack, labelKey: "cantaiaPrix", alwaysShow: false, conditionKey: "has_budget_estimate" },
];

export function ActiveProjectSection({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("nav");
  const { activeProject, navCounts, isLoading } = useActiveProject();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Filter tools based on nav counts
  const visibleTools = navCounts
    ? PROJECT_TOOLS.filter((tool) => {
        if (tool.alwaysShow) return true;
        if (!tool.conditionKey) return true;
        const val = navCounts[tool.conditionKey];
        if (typeof val === "boolean") return val;
        if (typeof val === "number") return val >= 1;
        return false;
      })
    : PROJECT_TOOLS.filter((tool) => tool.alwaysShow);

  const getToolHref = (tool: ProjectTool): string => {
    if (!activeProject) return "#";
    if (!tool.tab) return `/projects/${activeProject.id}`;
    return `/projects/${activeProject.id}?tab=${tool.tab}`;
  };

  const isToolActive = (tool: ProjectTool): boolean => {
    if (!activeProject) return false;
    const pathWithoutLocale = pathname.replace(/^\/(fr|en|de)/, "");
    const projectPath = `/projects/${activeProject.id}`;
    if (!pathWithoutLocale.startsWith(projectPath)) return false;
    // usePathname() does NOT include query params — use useSearchParams() for tab matching
    const currentTab = searchParams.get("tab");
    if (!tool.tab) return !currentTab; // Overview: active when no tab param
    return currentTab === tool.tab;
  };

  const getCount = (tool: ProjectTool): number | null => {
    if (!navCounts || !tool.countKey) return null;
    const val = navCounts[tool.countKey];
    if (typeof val === "number" && val > 0) return val;
    return null;
  };

  // Collapsed: show project color dot, popover on hover
  if (collapsed) {
    return (
      <div className="px-2 py-2">
        <div className="group relative flex justify-center">
          {activeProject ? (
            <div
              className="h-8 w-8 rounded-md flex items-center justify-center text-xs font-bold text-white cursor-pointer"
              style={{ backgroundColor: activeProject.color || "#2563EB" }}
              title={activeProject.name}
            >
              {activeProject.name.charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="h-8 w-8 rounded-md flex items-center justify-center bg-muted text-muted-foreground text-xs">
              ?
            </div>
          )}
          {/* Popover on hover — simplified, full implementation can use Radix */}
          <div className="invisible group-hover:visible absolute left-full ml-2 top-0 z-50 min-w-[200px] rounded-md border bg-popover p-2 shadow-md">
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
              {t("sections.activeProject")}
            </p>
            {activeProject ? (
              <>
                <p className="px-2 py-1 text-sm font-medium">{activeProject.name}</p>
                {visibleTools.map((tool) => {
                  const Icon = tool.icon;
                  const count = getCount(tool);
                  return (
                    <Link
                      key={tool.key}
                      href={getToolHref(tool)}
                      className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{t(tool.labelKey)}</span>
                      {count !== null && (
                        <span className="ml-auto text-xs text-muted-foreground">{count}</span>
                      )}
                    </Link>
                  );
                })}
              </>
            ) : (
              <p className="px-2 py-1 text-sm text-muted-foreground">{t("selectProject")}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-1">
      {/* Section header */}
      <p className="px-5 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {t("sections.activeProject")}
      </p>

      {/* Project switcher */}
      <ProjectSwitcher />

      {/* Adaptive tools */}
      {activeProject && (
        <div className="mt-1 space-y-0.5 px-3">
          {visibleTools.map((tool) => {
            const Icon = tool.icon;
            const active = isToolActive(tool);
            const count = getCount(tool);
            return (
              <Link
                key={tool.key}
                href={getToolHref(tool)}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-foreground/80 hover:bg-accent"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] ${active ? "text-blue-600" : ""}`} />
                <span className="truncate">{t(tool.labelKey)}</span>
                {count !== null && (
                  <span
                    className={`ml-auto text-xs ${
                      active ? "text-blue-600" : "text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}

          {/* See all */}
          <Link
            href={`/projects/${activeProject.id}`}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          >
            <MoreHorizontal className="h-[18px] w-[18px]" />
            <span>{t("seeAll")}</span>
          </Link>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !activeProject && (
        <div className="px-5 py-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/app/ActiveProjectSection.tsx
git commit -m "feat(nav): add ActiveProjectSection with adaptive tools and collapsed popover"
```

---

## Task 7: Sidebar Rewrite

**Files:**
- Modify: `apps/web/src/components/app/Sidebar.tsx`

**Dependencies:** Tasks 1, 5, 6

This is the largest task. The sidebar is rewritten from a flat NavItem loop to 3 explicit sections.

- [ ] **Step 1: Read current Sidebar.tsx**

Read `apps/web/src/components/app/Sidebar.tsx` to understand exact line numbers and structure before editing.

- [ ] **Step 2: Update imports**

Add new imports at the top of `Sidebar.tsx`:

```typescript
import { ActiveProjectSection } from "./ActiveProjectSection";
```

- [ ] **Step 3: Replace the navItems array**

Replace the existing `navItems` array (which has 14 items in 5+ groups) with two smaller arrays:

```typescript
// Section: QUOTIDIEN
const dailyItems: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, status: "active" as NavItemStatus },
  { href: "/mail", labelKey: "mail", icon: Mail, status: "active" as NavItemStatus, badge: unreadEmailCount > 0 ? String(unreadEmailCount) : undefined },
  { href: "/briefing", labelKey: "briefing", icon: Newspaper, status: "active" as NavItemStatus },
];

// Section: RÉFÉRENTIELS
const referenceItems: NavItem[] = [
  { href: "/suppliers", labelKey: "suppliers", icon: Truck, status: "active" as NavItemStatus },
  { href: "/cantaia-prix", labelKey: "cantaiaPrix", icon: TrendingUp, status: "active" as NavItemStatus },
  { href: "/chat", labelKey: "assistantAi", icon: MessageSquare, status: "active" as NavItemStatus },
];
```

Remove the old `navItems` array entirely. Remove the `direction` conditional item and the `action-board` item.

- [ ] **Step 4: Replace the desktop sidebar nav rendering**

The existing Sidebar uses a `renderNavItem(item)` function (around line 124-185) that renders each `NavItem` as a `<Link>` with icon, label, badge, tooltip, and active state. This function is reused as-is — we just change which arrays it maps over.

Find the desktop sidebar `<nav>` section that currently maps over `navItems` (something like `navItems.map(renderNavItem)` or similar). Replace the contents with 3 explicit sections, reusing the existing `renderNavItem`:

```tsx
<nav className="flex-1 overflow-y-auto py-2">
  {/* QUOTIDIEN */}
  <div className="mb-2">
    {!collapsed && (
      <p className="px-5 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {t("sections.daily")}
      </p>
    )}
    {dailyItems.map((item) => renderNavItem(item))}
  </div>

  {/* RÉFÉRENTIELS */}
  <div className="mb-2 border-t pt-2">
    {!collapsed && (
      <p className="px-5 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {t("sections.references")}
      </p>
    )}
    {referenceItems.map((item) => renderNavItem(item))}
  </div>

  {/* PROJET ACTIF */}
  <div className="border-t pt-2">
    <ActiveProjectSection collapsed={collapsed} />
  </div>
</nav>
```

**Important:** Keep the existing `renderNavItem` function intact. It handles: active state detection via `isActive(href)`, collapsed tooltip, icon rendering, badge display, and branding colors. Only the data arrays and grouping structure change.

- [ ] **Step 5: Update the `t` hook namespace**

Ensure the `useTranslations("nav")` call is in scope and the component uses `t("sections.daily")` etc.

- [ ] **Step 6: Update mobile bottom bar**

Replace the `mobileBottomItems` array:

```typescript
const mobileBottomItems = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/mail", labelKey: "mail", icon: Mail, badge: unreadEmailCount > 0 ? String(unreadEmailCount) : undefined },
  // Project active item is handled separately as a sheet trigger
  { href: "/chat", labelKey: "assistantAi", icon: MessageSquare },
];
```

Add a project active button between Mail and Chat that opens a bottom sheet with `ProjectSwitcher` + `ActiveProjectSection` content. Use a simple sheet/modal pattern from the existing code.

- [ ] **Step 7: Update mobile extra items**

Replace `mobileExtraItems` to match the new structure:

```typescript
const mobileExtraItems = [
  { href: "/briefing", labelKey: "briefing", icon: Newspaper },
  { href: "/suppliers", labelKey: "suppliers", icon: Truck },
  { href: "/cantaia-prix", labelKey: "cantaiaPrix", icon: TrendingUp },
  { href: "/settings", labelKey: "settings", icon: Settings },
  // Conditional admin
  ...(isManager || isSuperAdmin
    ? [{ href: "/admin", labelKey: "admin", icon: Shield }]
    : []),
];
```

Remove Direction, Tasks (global), PV de chantier, Visits, Projects, Plans, Submissions from mobile extra items (they are all accessible via the project active section or Command Palette).

- [ ] **Step 8: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build.

- [ ] **Step 9: Manual test**

Run: `cd apps/web && pnpm dev`
Open `http://localhost:3000` and verify:
- 3 sections visible in sidebar (Quotidien, Référentiels, Projet Actif)
- Project switcher shows recent projects
- Adaptive tools appear/hide based on project data
- Collapsed sidebar shows project initial + popover
- Mobile bottom bar updated

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/app/Sidebar.tsx
git commit -m "feat(nav): rewrite sidebar with 3 sections (Quotidien, Référentiels, Projet Actif)"
```

---

## Task 8: ProjectBreadcrumb Component

**Files:**
- Create: `apps/web/src/components/ui/ProjectBreadcrumb.tsx`

**Dependencies:** Task 4 (ActiveProjectProvider)

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/ui/ProjectBreadcrumb.tsx`:

```typescript
"use client";

import { useTranslations } from "next-intl";
import { useActiveProjectSafe } from "@/lib/contexts/active-project-context";
import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";

interface ProjectBreadcrumbProps {
  /** The current section key (matches breadcrumb i18n keys: tasks, plans, submissions, etc.) */
  section?: string;
}

export function ProjectBreadcrumb({ section }: ProjectBreadcrumbProps) {
  const t = useTranslations("breadcrumb");
  const ctx = useActiveProjectSafe();

  // Don't render if no active project context or no project selected
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
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/ProjectBreadcrumb.tsx
git commit -m "feat(nav): add ProjectBreadcrumb component with active project context"
```

**Note:** Integrating `<ProjectBreadcrumb />` into individual pages (project tabs, submission detail, plan detail) is done as part of Task 9 alongside context switching.

---

## Task 9: Context Switching Integration

**Files:**
- Modify: `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/plans/[id]/page.tsx`

**Dependencies:** Task 4 (ActiveProjectProvider), Task 8 (ProjectBreadcrumb)

- [ ] **Step 1: Wire context switch in project detail page**

In `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx`:

Add import:
```typescript
import { useActiveProject } from "@/lib/contexts/active-project-context";
import { ProjectBreadcrumb } from "@/components/ui/ProjectBreadcrumb";
```

Inside the component, after the existing `useEffect` that fetches the project, add:

```typescript
const { setActiveProject, refreshCounts } = useActiveProject();

// Switch active project when viewing a project
useEffect(() => {
  if (project?.id) {
    setActiveProject(project.id);
  }
}, [project?.id, setActiveProject]);
```

Add `<ProjectBreadcrumb />` above the page title (the breadcrumb auto-reads the active project). For tab views, pass the current tab as `section`:

```tsx
<ProjectBreadcrumb section={activeTab !== "overview" ? activeTab : undefined} />
```

Also, after any mutation (task creation, plan upload, etc.), call `refreshCounts()`.

- [ ] **Step 2: Wire context switch in submission detail page**

In `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx`:

Add import:
```typescript
import { useActiveProject } from "@/lib/contexts/active-project-context";
import { ProjectBreadcrumb } from "@/components/ui/ProjectBreadcrumb";
```

After the submission data is fetched (look for the existing `useEffect` / `fetch` that loads the submission), add:

```typescript
const { setActiveProject } = useActiveProject();

useEffect(() => {
  if (submission?.project_id) {
    setActiveProject(submission.project_id);
  }
}, [submission?.project_id, setActiveProject]);
```

Add `<ProjectBreadcrumb section="submissions" />` above the submission title.

- [ ] **Step 3: Wire context switch in plan detail page**

In `apps/web/src/app/[locale]/(app)/plans/[id]/page.tsx`:

Add import:
```typescript
import { useActiveProject } from "@/lib/contexts/active-project-context";
import { ProjectBreadcrumb } from "@/components/ui/ProjectBreadcrumb";
```

After the plan data is fetched, add:

```typescript
const { setActiveProject } = useActiveProject();

useEffect(() => {
  if (plan?.project_id) {
    setActiveProject(plan.project_id);
  }
}, [plan?.project_id, setActiveProject]);
```

Add `<ProjectBreadcrumb section="plans" />` above the plan title.

- [ ] **Step 4: Wire email click context switch in Mail page**

In `apps/web/src/app/[locale]/(app)/mail/page.tsx`, find the handler that opens/selects an email (likely an `onClick` on email cards). When a classified email with `project_id` is selected, call `setActiveProject`:

Add import:
```typescript
import { useActiveProject } from "@/lib/contexts/active-project-context";
```

Inside the component:
```typescript
const { setActiveProject } = useActiveProject();
```

In the email click/select handler, after setting the selected email state:
```typescript
// Context switch when clicking an email classified in a project
if (selectedEmail.project_id) {
  setActiveProject(selectedEmail.project_id);
}
```

This triggers a sidebar update to show the associated project's tools.

- [ ] **Step 5: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\[locale\]/\(app\)/projects/\[id\]/page.tsx apps/web/src/app/\[locale\]/\(app\)/submissions/\[id\]/page.tsx apps/web/src/app/\[locale\]/\(app\)/plans/\[id\]/page.tsx apps/web/src/app/\[locale\]/\(app\)/mail/page.tsx
git commit -m "feat(nav): wire context switching and breadcrumbs into project/submission/plan/mail pages"
```

---

## Task 10a: Direction Page → Redirect

**Files:**
- Modify: `apps/web/src/app/[locale]/(app)/direction/page.tsx`

**Dependencies:** None

- [ ] **Step 1: Save Direction page logic before replacing**

Before replacing the file, read the entire content of `apps/web/src/app/[locale]/(app)/direction/page.tsx` (400+ lines). Copy the component body (everything except the default export and the "use client" directive) into a new file:

Create `apps/web/src/components/app/DashboardOrgView.tsx`:

```typescript
"use client";

// Copy ALL imports from direction/page.tsx here (useState, useEffect, Supabase, lucide icons, etc.)
// EXCEPT: remove any page-level metadata exports

// Copy ALL interfaces/types from direction/page.tsx (Project, Task, Submission, etc.)

// Copy ALL helper functions (isOverdue, daysBetween, calculateHealth, getProjectAlerts, etc.)

// Rename the component:
export function DashboardOrgView() {
  // Copy the ENTIRE component body from direction/page.tsx:
  // - All useState hooks
  // - All useEffect data fetching (projects, tasks, members, submissions, receptions)
  // - All useMemo computations (health, alerts, KPIs)
  // - The entire JSX return

  // The rendering stays identical — we're just moving it into an embeddable component.
}
```

The goal is a 1:1 extraction. The component should render identically to the old Direction page.

- [ ] **Step 2: Replace Direction page with redirect**

Replace the entire content of `apps/web/src/app/[locale]/(app)/direction/page.tsx` with:

```typescript
import { redirect } from "next/navigation";

export default function DirectionPage() {
  redirect("/dashboard?view=org");
}
```

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build. `DashboardOrgView` is created but not yet imported anywhere — that is fine.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/app/DashboardOrgView.tsx apps/web/src/app/\[locale\]/\(app\)/direction/page.tsx
git commit -m "refactor(nav): extract Direction content to DashboardOrgView, add redirect"
```

---

## Task 10b: Dashboard Organisation Tab

**Files:**
- Modify: `apps/web/src/app/[locale]/(app)/dashboard/page.tsx`

**Dependencies:** Task 1 (i18n keys), Task 10a (DashboardOrgView)

- [ ] **Step 1: Add imports and state**

In `apps/web/src/app/[locale]/(app)/dashboard/page.tsx`, add imports:

```typescript
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { DashboardOrgView } from "@/components/app/DashboardOrgView";
```

Add translation hook and state near the top of the component:

```typescript
const tDashboard = useTranslations("dashboard");
const searchParams = useSearchParams();
const router = useRouter();
const view = searchParams.get("view") || "personal";
```

Add role check (reuse the existing auth/profile data the page already fetches):

```typescript
const isManager = profile?.role && ["project_manager", "director", "admin"].includes(profile.role);
const isSuperAdmin = profile?.is_superadmin;
const showOrgToggle = isManager || isSuperAdmin;
```

- [ ] **Step 2: Add tab toggle UI**

After the page title/header and before the existing dashboard content, add:

```tsx
{showOrgToggle && (
  <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit">
    <button
      onClick={() => router.replace("/dashboard")}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        view === "personal"
          ? "bg-white shadow-sm text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {tDashboard("personalView")}
    </button>
    <button
      onClick={() => router.replace("/dashboard?view=org")}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        view === "org"
          ? "bg-white shadow-sm text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {tDashboard("orgView")}
    </button>
  </div>
)}
```

- [ ] **Step 3: Conditionally render views**

Wrap the existing dashboard content in a conditional, and add the org view:

```tsx
{view === "org" && showOrgToggle ? (
  <DashboardOrgView />
) : (
  <>
    {/* Existing dashboard content (KPIs, tasks, projects, etc.) */}
  </>
)}
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\[locale\]/\(app\)/dashboard/page.tsx
git commit -m "feat(nav): add Organisation tab to Dashboard with Direction content"
```

---

## Task 11: Action Board Redirect + Cleanup

**Files:**
- Modify: `apps/web/src/app/[locale]/(app)/action-board/page.tsx`
- Delete: `apps/web/src/app/api/action-board/route.ts`

- [ ] **Step 1: Replace Action Board page with redirect**

Replace the entire content of `apps/web/src/app/[locale]/(app)/action-board/page.tsx` with:

```typescript
import { redirect } from "next/navigation";

export default function ActionBoardPage() {
  redirect("/dashboard");
}
```

- [ ] **Step 2: Delete the API route**

Delete file: `apps/web/src/app/api/action-board/route.ts`

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build. No other file should import from the deleted route.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\[locale\]/\(app\)/action-board/page.tsx
git rm apps/web/src/app/api/action-board/route.ts
git commit -m "feat(nav): redirect Action Board to Dashboard, remove API route"
```

---

## Task 12: Mobile Navigation Update

**Files:**
- Modify: `apps/web/src/components/app/Sidebar.tsx` (mobile section)

**Dependencies:** Task 7 (Sidebar rewrite — mobile items already partially updated)

This task refines the mobile bottom sheet for the "Projet actif" button.

- [ ] **Step 1: Add project active sheet to mobile nav**

In the mobile section of `Sidebar.tsx`, find the bottom bar rendering and add a button between Mail and Chat that opens a sheet:

```tsx
{/* Mobile bottom bar */}
<div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white lg:hidden">
  <div className="flex items-center justify-around py-2">
    {/* Dashboard */}
    <MobileNavButton href="/dashboard" icon={LayoutDashboard} label={t("dashboard")} />
    {/* Mail */}
    <MobileNavButton href="/mail" icon={Mail} label={t("mail")} badge={unreadEmailCount} />
    {/* Projet Actif — opens sheet */}
    <button
      onClick={() => setMobileProjectSheetOpen(true)}
      className="flex flex-col items-center gap-0.5 px-3 py-1"
    >
      {activeProject ? (
        <span
          className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
          style={{ backgroundColor: activeProject.color || "#2563EB" }}
        >
          {activeProject.name.charAt(0)}
        </span>
      ) : (
        <FolderKanban className="h-6 w-6 text-muted-foreground" />
      )}
      <span className="text-[10px] text-muted-foreground">
        {activeProject ? activeProject.name.slice(0, 8) : t("selectProject")}
      </span>
    </button>
    {/* Assistant IA */}
    <MobileNavButton href="/chat" icon={MessageSquare} label={t("assistantAi")} />
    {/* More */}
    <button onClick={() => setMobileMenuOpen(true)} className="flex flex-col items-center gap-0.5 px-3 py-1">
      <MoreHorizontal className="h-6 w-6 text-muted-foreground" />
      <span className="text-[10px] text-muted-foreground">{t("more")}</span>
    </button>
  </div>
</div>
```

Add state for the project sheet:
```typescript
const [mobileProjectSheetOpen, setMobileProjectSheetOpen] = useState(false);
const { activeProject } = useActiveProject();
```

Render a bottom sheet when open with `ProjectSwitcher` + `ActiveProjectSection` content.

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/app/Sidebar.tsx
git commit -m "feat(nav): add mobile project active bottom sheet"
```

---

## Post-Implementation Verification

After all 12 tasks are complete:

- [ ] **Full build check:** `cd apps/web && npx next build`
- [ ] **Type check:** `pnpm type-check`
- [ ] **Lint:** `pnpm lint`
- [ ] **Manual smoke test:** Navigate through all 3 sidebar sections, switch projects, verify breadcrumbs, test mobile nav, verify `/direction` and `/action-board` redirects
- [ ] **Final commit (if needed):** Fix any remaining issues

```bash
git log --oneline -13  # Verify all 13 commits are present (Tasks 1-9, 10a, 10b, 11, 12)
```
