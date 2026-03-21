# Phase 1 — Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 4 most impactful issues identified in the Cantaia audit: SubmissionEditor data persistence, Kanban drag & drop, placeholder page cleanup, and Mail i18n.

**Architecture:** Each task is independent — no cross-dependencies. SubmissionEditor gets a new PATCH API route + DB persistence. Kanban gets dnd-kit wiring (already imported but unused). Page cleanup is pure deletion. Mail i18n extracts ~50 hardcoded strings into translation files.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL), dnd-kit, next-intl, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-18-cantaia-audit-optimisation-design.md` sections 3.1–3.4

---

## File Structure

### Task 1: SubmissionEditor DB Sync
- **Create:** `apps/web/src/app/api/submissions/[id]/items/route.ts` — PATCH endpoint for saving submission items to DB
- **Modify:** `apps/web/src/components/submissions/SubmissionEditor.tsx` — Add DB persistence alongside localStorage

### Task 2: Kanban Drag & Drop
- **Modify:** `apps/web/src/components/tasks/TaskKanbanView.tsx` — Add DndContext, droppable columns, draggable cards

### Task 3: Placeholder Page Cleanup
- **Delete:** 22 page files across meetings/, admin/, and top-level admin routes
- **Modify:** `apps/web/src/middleware.ts` — Remove deleted routes from protected list

### Task 4: Mail i18n
- **Modify:** `apps/web/src/app/[locale]/(app)/mail/page.tsx` — Replace hardcoded FR strings with `t()` calls
- **Modify:** `apps/web/messages/fr.json` — Add `mail` section
- **Modify:** `apps/web/messages/en.json` — Add `mail` section
- **Modify:** `apps/web/messages/de.json` — Add `mail` section

---

## Task 1: SubmissionEditor DB Sync

**Context:** `SubmissionEditor.tsx` currently saves via `saveSubmissionsToStorage()` to localStorage only. The `handleSave()` function (line ~121) builds a `SavedSubmission` object and writes it to a localStorage array. There is NO existing PATCH route for `/api/submissions/[id]` — only GET and DELETE exist.

**Files:**
- Create: `apps/web/src/app/api/submissions/[id]/items/route.ts`
- Modify: `apps/web/src/components/submissions/SubmissionEditor.tsx`

### Step 1: Create the API route

- [ ] **1.1 Create `apps/web/src/app/api/submissions/[id]/items/route.ts`**

This route accepts the full items array and upserts them for a submission. It follows the existing org verification pattern from `/api/tasks/[id]/route.ts`.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify org ownership
    const { data: userProfile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: submission } = await admin
      .from("submissions")
      .select("id, project_id, projects!inner(organization_id)")
      .eq("id", id)
      .single();

    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const projectOrg = (submission as any).projects?.organization_id;
    if (projectOrg !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: "items must be an array" },
        { status: 400 }
      );
    }

    // Delete existing items for this submission
    await admin
      .from("submission_items")
      .delete()
      .eq("submission_id", id);

    // Insert new items if any
    if (items.length > 0) {
      const rows = items.map((item: any, index: number) => ({
        submission_id: id,
        item_number: item.item_number || String(index + 1),
        description: item.description || "",
        unit: item.unit || null,
        quantity: item.quantity || null,
        cfc_code: item.cfc_code || null,
        material_group: item.material_group || null,
        product_name: item.product_name || null,
      }));

      const { error: insertError } = await admin
        .from("submission_items")
        .insert(rows);

      if (insertError) {
        console.error("[submissions/items] Insert error:", insertError);
        return NextResponse.json(
          { error: "Failed to save items" },
          { status: 500 }
        );
      }
    }

    // Update submission updated_at
    await admin
      .from("submissions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({
      success: true,
      updated_at: new Date().toISOString(),
      items_count: items.length,
    });
  } catch (err) {
    console.error("[submissions/items] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

- [ ] **1.2 Verify route responds**

Run: `curl -X PATCH http://localhost:3000/api/submissions/test/items -H "Content-Type: application/json" -d '{"items":[]}'`
Expected: 401 Unauthorized (no auth token — confirms route loads)

### Step 2: Add DB persistence to SubmissionEditor

- [ ] **1.3 Modify `SubmissionEditor.tsx` — add `saveToDb` function**

Add this function after the existing state declarations (around line 75):

```typescript
const [saveStatus, setSaveStatus] = useState<
  "saved" | "saving" | "unsaved" | "error"
>("saved");

async function saveToDb(items: Position[]) {
  if (!submission?.id) return;
  setSaveStatus("saving");
  try {
    const res = await fetch(`/api/submissions/${submission.id}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((p) => ({
          item_number: p.number,
          description: p.description,
          unit: p.unit,
          quantity: p.quantity,
          cfc_code: p.cfc_code,
          material_group: p.material_group,
          product_name: p.product_name,
        })),
      }),
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    setSaveStatus("saved");
  } catch (err) {
    console.error("[SubmissionEditor] DB save failed:", err);
    setSaveStatus("error");
  }
}
```

- [ ] **1.4 Modify `handleSave` to call `saveToDb` alongside localStorage**

In the existing `handleSave` function, after the `saveSubmissionsToStorage(all)` call (around line 140), add:

```typescript
// After: saveSubmissionsToStorage(all);
// Add:
saveToDb(positions);
```

- [ ] **1.5 Add save status indicator in the editor header**

Find the header section of the editor (the area showing submission title). Add after the title:

```tsx
<span className={`ml-3 text-xs px-2 py-0.5 rounded-full ${
  saveStatus === "saved" ? "bg-green-100 text-green-700" :
  saveStatus === "saving" ? "bg-blue-100 text-blue-700" :
  saveStatus === "error" ? "bg-red-100 text-red-700" :
  "bg-orange-100 text-orange-700"
}`}>
  {saveStatus === "saved" && "Sauvegardé ✓"}
  {saveStatus === "saving" && "Enregistrement..."}
  {saveStatus === "error" && "Erreur — cliquez pour réessayer"}
  {saveStatus === "unsaved" && "Non sauvegardé"}
</span>
```

- [ ] **1.6 Commit**

```bash
git add apps/web/src/app/api/submissions/[id]/items/route.ts apps/web/src/components/submissions/SubmissionEditor.tsx
git commit -m "feat(submissions): persist editor changes to database alongside localStorage"
```

---

## Task 2: Kanban Drag & Drop

**Context:** `TaskKanbanView.tsx` already imports `KeyboardSensor`, `PointerSensor`, `useSensor`, `useSensors`, `DragEndEvent` from `@dnd-kit/core` and `arrayMove`, `sortableKeyboardCoordinates` from `@dnd-kit/sortable`. But it never wraps the columns in a `DndContext`. The task PATCH route already accepts `status` updates.

**Files:**
- Modify: `apps/web/src/components/tasks/TaskKanbanView.tsx`

### Step 1: Add drag & drop infrastructure

- [ ] **2.1 Add missing dnd-kit imports**

At the top of `TaskKanbanView.tsx`, add to the existing dnd-kit imports:

```typescript
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
```

- [ ] **2.2 Add drag state and sensors**

Inside the component, after existing state declarations, add:

```typescript
const [activeTask, setActiveTask] = useState<Task | null>(null);

const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
);
```

- [ ] **2.3 Add drag handlers**

```typescript
function handleDragStart(event: DragStartEvent) {
  const task = tasks.find((t) => t.id === event.active.id);
  if (task) setActiveTask(task);
}

async function handleDragEnd(event: DragEndEvent) {
  setActiveTask(null);
  const { active, over } = event;
  if (!over) return;

  const taskId = active.id as string;
  const newStatus = over.id as string;
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.status === newStatus) return;

  // Optimistic update
  const prevTasks = [...tasks];
  onUpdateTasks?.(
    tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
  );

  try {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) throw new Error("Failed to update task");
  } catch (err) {
    console.error("[Kanban] Drag update failed:", err);
    // Rollback
    onUpdateTasks?.(prevTasks);
  }
}
```

- [ ] **2.4 Wrap columns in DndContext**

Replace the outer columns container with:

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCorners}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
  <div className="flex gap-4 overflow-x-auto pb-4">
    {KANBAN_COLUMNS.map((col) => {
      const colTasks = tasks.filter((t) => t.status === col.id);
      return (
        <KanbanColumn
          key={col.id}
          id={col.id}
          label={col.label}
          tasks={colTasks}
          onOpenTask={onOpenTask}
          projects={projects}
          t={t}
        />
      );
    })}
  </div>
  <DragOverlay>
    {activeTask ? (
      <TaskCard task={activeTask} projects={projects} t={t} isDragging />
    ) : null}
  </DragOverlay>
</DndContext>
```

- [ ] **2.5 Make columns droppable**

Extract the column rendering into a `KanbanColumn` component that uses `useDroppable`:

```tsx
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";

function KanbanColumn({
  id, label, tasks, onOpenTask, projects, t,
}: {
  id: string; label: string; tasks: Task[];
  onOpenTask: (task: Task) => void; projects: any[]; t: any;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const style = COLUMN_STYLES[id as keyof typeof COLUMN_STYLES];

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[280px] flex-1 rounded-lg transition-colors ${
        isOver ? "ring-2 ring-blue-400 bg-blue-50/50" : ""
      }`}
    >
      {/* existing column header */}
      <div className={`p-3 rounded-t-lg ${style?.headerBg || "bg-gray-100"}`}>
        <div className="flex items-center justify-between">
          <span className={`font-medium text-sm ${style?.headerColor || ""}`}>
            {t(`status${id.charAt(0).toUpperCase() + id.slice(1).replace(/_./g, (m: string) => m[1].toUpperCase())}`)}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${style?.countBg || ""} ${style?.countColor || ""}`}>
            {tasks.length}
          </span>
        </div>
      </div>
      <div className="p-2 space-y-2 min-h-[200px]">
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            projects={projects}
            t={t}
            onOpenTask={onOpenTask}
          />
        ))}
        {tasks.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">
            {t("noTasks")}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **2.6 Make cards draggable**

```tsx
function DraggableTaskCard({
  task, projects, t, onOpenTask,
}: {
  task: Task; projects: any[]; t: any; onOpenTask: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  const style = {
    transform: transform
      ? `translate(${transform.x}px, ${transform.y}px)`
      : undefined,
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TaskCard
        task={task}
        projects={projects}
        t={t}
        onClick={() => onOpenTask(task)}
      />
    </div>
  );
}
```

- [ ] **2.7 Add `onUpdateTasks` prop to the component**

Update the component props interface to accept an `onUpdateTasks` callback:

```typescript
interface TaskKanbanViewProps {
  tasks: Task[];
  projects: any[];
  onOpenTask: (task: Task) => void;
  onUpdateTasks?: (tasks: Task[]) => void; // NEW
}
```

Then in the parent page (`tasks/page.tsx`), pass:

```tsx
<TaskKanbanView
  tasks={tasks}
  projects={projects}
  onOpenTask={handleOpenTask}
  onUpdateTasks={setTasks}  // NEW
/>
```

- [ ] **2.8 Commit**

```bash
git add apps/web/src/components/tasks/TaskKanbanView.tsx apps/web/src/app/[locale]/(app)/tasks/page.tsx
git commit -m "feat(tasks): add drag & drop between Kanban columns with optimistic updates"
```

---

## Task 3: Placeholder Page Cleanup

**Context:** 22 pages to delete (6 meetings legacy, 11 admin stubs, 5 top-level admin stubs). Plus 2 duplicate pages. Then update middleware to remove deleted routes.

**Files:**
- Delete: 24 page files
- Modify: `apps/web/src/middleware.ts`

### Step 1: Delete meetings legacy pages

- [ ] **3.1 Delete 4 meetings pages**

```bash
rm -rf apps/web/src/app/\[locale\]/\(app\)/meetings/
```

This removes:
- `meetings/page.tsx`
- `meetings/new/page.tsx`
- `meetings/[id]/edit/page.tsx`
- `meetings/[id]/record/page.tsx` (if exists)

### Step 2: Delete admin stub pages

- [ ] **3.2 Delete admin stubs**

```bash
rm apps/web/src/app/\[locale\]/\(admin\)/admin/alerts/page.tsx
rm apps/web/src/app/\[locale\]/\(admin\)/admin/logs/page.tsx
rm apps/web/src/app/\[locale\]/\(admin\)/admin/settings/page.tsx
rm apps/web/src/app/\[locale\]/\(admin\)/admin/users/page.tsx
rm -rf apps/web/src/app/\[locale\]/\(admin\)/admin/organizations/
```

Keep: `admin/page.tsx`, `admin/members/`, `admin/branding/`, `admin/finances/`, `admin/time-savings/`

### Step 3: Delete top-level admin stubs and duplicates

- [ ] **3.3 Delete top-level admin stubs**

```bash
rm apps/web/src/app/\[locale\]/\(admin\)/analytics/page.tsx
rm apps/web/src/app/\[locale\]/\(admin\)/api-costs/page.tsx
rm apps/web/src/app/\[locale\]/\(admin\)/clients/page.tsx
rm apps/web/src/app/\[locale\]/\(admin\)/debug/page.tsx
rm apps/web/src/app/\[locale\]/\(admin\)/logs/page.tsx
```

- [ ] **3.4 Delete duplicate pages**

```bash
# /admin/branding is duplicate of /admin/admin/branding
rm apps/web/src/app/\[locale\]/\(admin\)/branding/page.tsx

# /pricing-intelligence duplicates /cantaia-prix functionality
rm -rf apps/web/src/app/\[locale\]/\(app\)/pricing-intelligence/
```

### Step 4: Update middleware

- [ ] **3.5 Remove deleted routes from middleware protected routes list**

In `apps/web/src/middleware.ts`, find the `protectedRoutes` array and remove:
- `/meetings`
- `/analytics`
- `/api-costs`
- `/clients`
- `/debug`
- `/pricing-intelligence`

Keep all other protected routes unchanged.

- [ ] **3.6 Verify build succeeds**

Run: `pnpm build`
Expected: Build succeeds with no errors about missing pages. Any imports referencing deleted pages will cause build errors — fix if found.

- [ ] **3.7 Commit**

```bash
git add -A
git commit -m "chore: remove 24 placeholder/duplicate pages identified in audit"
```

---

## Task 4: Mail Page i18n

**Context:** `/mail/page.tsx` (~650 lines) has ~50 hardcoded French strings including day/month names, button labels, stat labels, error messages, and modal content. The page does NOT use `useTranslations()` at all.

**Files:**
- Modify: `apps/web/src/app/[locale]/(app)/mail/page.tsx`
- Modify: `apps/web/messages/fr.json`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/de.json`

### Step 1: Add translation keys to all 3 locales

- [ ] **4.1 Add `mail` section to `messages/fr.json`**

Add inside the root object:

```json
"mail": {
  "title": "Décisions du jour",
  "sync": "Synchroniser",
  "syncing": "Synchronisation...",
  "syncSuccess": "Synchronisation terminée",
  "syncError": "Erreur de synchronisation",
  "connectionError": "Erreur de connexion",
  "loadBodies": "Charger les corps",
  "generateSummaries": "Générer les résumés",
  "filters": {
    "urgent": "Urgent",
    "thisWeek": "Cette semaine",
    "info": "Info"
  },
  "stats": {
    "decisionsToday": "Décisions aujourd'hui",
    "responseTime": "Temps de réponse",
    "totalUnprocessed": "Total non traités",
    "savingsGenerated": "Économies générées"
  },
  "email": {
    "noSubject": "(Sans objet)",
    "noProject": "Sans projet",
    "thread": "Fil de conversation",
    "originalEmail": "Email original",
    "conversation": "Conversation ({count})",
    "archiveAll": "Tout archiver ({count})",
    "markAllRead": "Tout marquer comme lu"
  },
  "actions": {
    "reply": "Répondre",
    "delegate": "Déléguer",
    "transfer": "Transférer",
    "archive": "Archiver",
    "snooze": "Rappel",
    "accept": "Accepter",
    "negotiate": "Négocier",
    "refuse": "Refuser",
    "createTask": "Créer une tâche",
    "viewEmail": "Lire l'email"
  },
  "replyModal": {
    "title": "Répondre",
    "aiSuggestion": "Suggestion IA",
    "generating": "Génération de la réponse...",
    "send": "Envoyer",
    "cancel": "Annuler",
    "sendError": "Erreur lors de l'envoi"
  },
  "delegateModal": {
    "title": "Déléguer",
    "selectMember": "Sélectionner un membre",
    "message": "Message (optionnel)",
    "confirm": "Déléguer",
    "error": "Erreur lors de la délégation"
  },
  "transferModal": {
    "title": "Transférer",
    "to": "Destinataire",
    "message": "Message (optionnel)",
    "confirm": "Transférer",
    "error": "Erreur lors du transfert"
  },
  "empty": {
    "urgent": "Aucun email urgent",
    "thisWeek": "Aucune action cette semaine",
    "info": "Aucun email informatif",
    "noEmails": "Aucun email à traiter"
  },
  "time": {
    "minutesAgo": "il y a {count} min",
    "hoursAgo": "il y a {count}h",
    "daysAgo": "il y a {count}j",
    "justNow": "à l'instant"
  },
  "days": {
    "0": "Dimanche",
    "1": "Lundi",
    "2": "Mardi",
    "3": "Mercredi",
    "4": "Jeudi",
    "5": "Vendredi",
    "6": "Samedi"
  },
  "serverError": "Erreur serveur",
  "unreadEmails": "Emails non lus"
}
```

- [ ] **4.2 Add `mail` section to `messages/en.json`**

Same structure, English translations:

```json
"mail": {
  "title": "Today's Decisions",
  "sync": "Sync",
  "syncing": "Syncing...",
  "syncSuccess": "Sync complete",
  "syncError": "Sync error",
  "connectionError": "Connection error",
  "loadBodies": "Load email bodies",
  "generateSummaries": "Generate summaries",
  "filters": {
    "urgent": "Urgent",
    "thisWeek": "This week",
    "info": "Info"
  },
  "stats": {
    "decisionsToday": "Decisions today",
    "responseTime": "Response time",
    "totalUnprocessed": "Total unprocessed",
    "savingsGenerated": "Savings generated"
  },
  "email": {
    "noSubject": "(No subject)",
    "noProject": "No project",
    "thread": "Thread",
    "originalEmail": "Original email",
    "conversation": "Conversation ({count})",
    "archiveAll": "Archive all ({count})",
    "markAllRead": "Mark all as read"
  },
  "actions": {
    "reply": "Reply",
    "delegate": "Delegate",
    "transfer": "Forward",
    "archive": "Archive",
    "snooze": "Snooze",
    "accept": "Accept",
    "negotiate": "Negotiate",
    "refuse": "Decline",
    "createTask": "Create task",
    "viewEmail": "Read email"
  },
  "replyModal": {
    "title": "Reply",
    "aiSuggestion": "AI Suggestion",
    "generating": "Generating reply...",
    "send": "Send",
    "cancel": "Cancel",
    "sendError": "Failed to send"
  },
  "delegateModal": {
    "title": "Delegate",
    "selectMember": "Select a member",
    "message": "Message (optional)",
    "confirm": "Delegate",
    "error": "Delegation failed"
  },
  "transferModal": {
    "title": "Forward",
    "to": "Recipient",
    "message": "Message (optional)",
    "confirm": "Forward",
    "error": "Forward failed"
  },
  "empty": {
    "urgent": "No urgent emails",
    "thisWeek": "No actions this week",
    "info": "No informational emails",
    "noEmails": "No emails to process"
  },
  "time": {
    "minutesAgo": "{count}m ago",
    "hoursAgo": "{count}h ago",
    "daysAgo": "{count}d ago",
    "justNow": "just now"
  },
  "days": {
    "0": "Sunday",
    "1": "Monday",
    "2": "Tuesday",
    "3": "Wednesday",
    "4": "Thursday",
    "5": "Friday",
    "6": "Saturday"
  },
  "serverError": "Server error",
  "unreadEmails": "Unread emails"
}
```

- [ ] **4.3 Add `mail` section to `messages/de.json`**

Same structure, German translations:

```json
"mail": {
  "title": "Heutige Entscheidungen",
  "sync": "Synchronisieren",
  "syncing": "Synchronisierung...",
  "syncSuccess": "Synchronisierung abgeschlossen",
  "syncError": "Synchronisierungsfehler",
  "connectionError": "Verbindungsfehler",
  "loadBodies": "E-Mail-Texte laden",
  "generateSummaries": "Zusammenfassungen generieren",
  "filters": {
    "urgent": "Dringend",
    "thisWeek": "Diese Woche",
    "info": "Info"
  },
  "stats": {
    "decisionsToday": "Entscheidungen heute",
    "responseTime": "Antwortzeit",
    "totalUnprocessed": "Gesamt unbearbeitet",
    "savingsGenerated": "Generierte Einsparungen"
  },
  "email": {
    "noSubject": "(Kein Betreff)",
    "noProject": "Kein Projekt",
    "thread": "Gesprächsverlauf",
    "originalEmail": "Original-E-Mail",
    "conversation": "Konversation ({count})",
    "archiveAll": "Alle archivieren ({count})",
    "markAllRead": "Alle als gelesen markieren"
  },
  "actions": {
    "reply": "Antworten",
    "delegate": "Delegieren",
    "transfer": "Weiterleiten",
    "archive": "Archivieren",
    "snooze": "Erinnerung",
    "accept": "Akzeptieren",
    "negotiate": "Verhandeln",
    "refuse": "Ablehnen",
    "createTask": "Aufgabe erstellen",
    "viewEmail": "E-Mail lesen"
  },
  "replyModal": {
    "title": "Antworten",
    "aiSuggestion": "KI-Vorschlag",
    "generating": "Antwort wird generiert...",
    "send": "Senden",
    "cancel": "Abbrechen",
    "sendError": "Fehler beim Senden"
  },
  "delegateModal": {
    "title": "Delegieren",
    "selectMember": "Mitglied auswählen",
    "message": "Nachricht (optional)",
    "confirm": "Delegieren",
    "error": "Delegierung fehlgeschlagen"
  },
  "transferModal": {
    "title": "Weiterleiten",
    "to": "Empfänger",
    "message": "Nachricht (optional)",
    "confirm": "Weiterleiten",
    "error": "Weiterleitung fehlgeschlagen"
  },
  "empty": {
    "urgent": "Keine dringenden E-Mails",
    "thisWeek": "Keine Aktionen diese Woche",
    "info": "Keine informativen E-Mails",
    "noEmails": "Keine E-Mails zu bearbeiten"
  },
  "time": {
    "minutesAgo": "vor {count} Min.",
    "hoursAgo": "vor {count} Std.",
    "daysAgo": "vor {count} T.",
    "justNow": "gerade eben"
  },
  "days": {
    "0": "Sonntag",
    "1": "Montag",
    "2": "Dienstag",
    "3": "Mittwoch",
    "4": "Donnerstag",
    "5": "Freitag",
    "6": "Samstag"
  },
  "serverError": "Serverfehler",
  "unreadEmails": "Ungelesene E-Mails"
}
```

### Step 2: Replace hardcoded strings in mail/page.tsx

- [ ] **4.4 Add `useTranslations` import and call**

At the top of the component function in `mail/page.tsx`, add:

```typescript
import { useTranslations } from "next-intl";
// ... inside component:
const t = useTranslations("mail");
```

- [ ] **4.5 Replace day/month names array**

Replace (line ~143):
```typescript
const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
```
With:
```typescript
const days = [t("days.0"), t("days.1"), t("days.2"), t("days.3"), t("days.4"), t("days.5"), t("days.6")];
```

- [ ] **4.6 Replace `timeAgo()` function labels**

Replace hardcoded "min", "h", "j" in the `timeAgo()` function with:
```typescript
if (diffMin < 1) return t("time.justNow");
if (diffMin < 60) return t("time.minutesAgo", { count: diffMin });
if (diffHours < 24) return t("time.hoursAgo", { count: diffHours });
return t("time.daysAgo", { count: diffDays });
```

- [ ] **4.7 Replace filter labels, stat labels, button labels, error messages**

Search and replace all remaining hardcoded French strings:
- `"Cette semaine"` → `t("filters.thisWeek")`
- `"Emails traités"` → `t("stats.totalUnprocessed")`
- `"Sans projet"` → `t("email.noProject")`
- `"Tout archiver"` → `t("email.archiveAll", { count })`
- `"Erreur serveur"` → `t("serverError")`
- `"Fil de conversation"` → `t("email.thread")`
- `"Email original"` → `t("email.originalEmail")`
- `"Erreur de synchronisation"` → `t("syncError")`
- `"Erreur de connexion"` → `t("connectionError")`
- All button labels: "Répondre" → `t("actions.reply")`, etc.
- All modal titles and labels

- [ ] **4.8 Verify build succeeds**

Run: `pnpm build`
Expected: Build succeeds. Check that no hardcoded French strings remain by searching: `grep -n '"[A-ZÀÉÈÊ]' apps/web/src/app/\[locale\]/\(app\)/mail/page.tsx | head -20`

- [ ] **4.9 Commit**

```bash
git add apps/web/src/app/[locale]/(app)/mail/page.tsx apps/web/messages/fr.json apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(mail): complete i18n — replace all hardcoded FR strings with useTranslations"
```

---

## Execution Checklist

| Task | Steps | Est. Time | Dependencies |
|------|-------|-----------|-------------|
| 1. SubmissionEditor DB Sync | 6 steps | 2-3h | None |
| 2. Kanban Drag & Drop | 8 steps | 2-3h | None |
| 3. Placeholder Cleanup | 7 steps | 1h | None |
| 4. Mail i18n | 9 steps | 2h | None |

All 4 tasks are independent and can be executed in parallel by separate agents.
