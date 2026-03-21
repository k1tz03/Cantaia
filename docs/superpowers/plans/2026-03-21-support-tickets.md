# Support Tickets System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ticket-based support system where users create/track support tickets and super-admins manage them with threaded conversations.

**Architecture:** Two Supabase tables (`support_tickets`, `support_messages`) with RLS. 7 API routes. 4 pages (2 user, 2 super-admin). 6 shared components. Sidebar integration with unread badge. Storage bucket for attachments.

**Tech Stack:** Next.js 15 API Routes, Supabase (PostgreSQL + Storage), React 19, Tailwind CSS, shadcn patterns, next-intl, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-03-21-support-tickets-design.md`

---

## File Structure

```
# New files
packages/database/migrations/059_support_tickets.sql
apps/web/src/app/api/support/tickets/route.ts                    # GET list + POST create
apps/web/src/app/api/support/tickets/[id]/route.ts               # GET detail + PATCH status
apps/web/src/app/api/support/tickets/[id]/messages/route.ts      # POST message
apps/web/src/app/api/support/tickets/[id]/attachments/route.ts   # POST upload
apps/web/src/app/api/support/tickets/unread-count/route.ts       # GET unread count
apps/web/src/components/support/TicketStatusBadge.tsx
apps/web/src/components/support/TicketCategoryBadge.tsx
apps/web/src/components/support/TicketCreateModal.tsx
apps/web/src/components/support/TicketThread.tsx
apps/web/src/components/support/TicketReplyInput.tsx
apps/web/src/app/[locale]/(app)/support/page.tsx
apps/web/src/app/[locale]/(app)/support/[id]/page.tsx
apps/web/src/app/[locale]/(super-admin)/super-admin/support/page.tsx
apps/web/src/app/[locale]/(super-admin)/super-admin/support/[id]/page.tsx

# Modified files
apps/web/src/middleware.ts                                       # Add /support to protectedPaths
apps/web/src/components/app/Sidebar.tsx                          # Add Support nav item + badge
apps/web/src/app/[locale]/(super-admin)/layout.tsx               # Add Support nav item
apps/web/messages/fr.json                                        # Add support + nav.support keys
apps/web/messages/en.json                                        # Same
apps/web/messages/de.json                                        # Same
```

---

### Task 1: Database migration

**Files:**
- Create: `packages/database/migrations/059_support_tickets.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Migration 059: Support Tickets System

-- Table: support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK (char_length(subject) <= 200),
  category TEXT NOT NULL CHECK (category IN ('bug', 'question', 'feature_request', 'billing')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  last_read_at TIMESTAMPTZ,
  last_admin_reply_at TIMESTAMPTZ,
  last_user_reply_at TIMESTAMPTZ,
  last_admin_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: support_messages
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'admin')),
  content TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_org ON support_tickets(organization_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_messages_ticket ON support_messages(ticket_id);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Tickets: user sees own tickets
CREATE POLICY "Users can view own tickets"
  ON support_tickets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own tickets"
  ON support_tickets FOR UPDATE
  USING (user_id = auth.uid());

-- Messages: user sees messages on own tickets
CREATE POLICY "Users can view messages on own tickets"
  ON support_messages FOR SELECT
  USING (ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert messages on own tickets"
  ON support_messages FOR INSERT
  WITH CHECK (ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid()));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_support_ticket_updated
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_support_ticket_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add packages/database/migrations/059_support_tickets.sql
git commit -m "feat(db): add support tickets migration 059"
```

---

### Task 2: i18n keys (FR/EN/DE)

**Files:**
- Modify: `apps/web/messages/fr.json`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/de.json`

- [ ] **Step 1: Add i18n keys to all 3 locale files**

Add `"support"` key in `nav` section of each file:
```json
"support": "Support"
```

Add new top-level `"support"` section in each file. **French:**
```json
"support": {
  "title": "Support",
  "newTicket": "Nouveau ticket",
  "subject": "Sujet",
  "category": "Catégorie",
  "priority": "Priorité",
  "message": "Message",
  "attachments": "Pièces jointes",
  "categoryBug": "Bug / Problème technique",
  "categoryQuestion": "Question / Aide",
  "categoryFeature": "Demande de fonctionnalité",
  "categoryBilling": "Facturation / Abonnement",
  "priorityLow": "Basse",
  "priorityMedium": "Moyenne",
  "priorityHigh": "Haute",
  "statusOpen": "Ouvert",
  "statusInProgress": "En cours",
  "statusResolved": "Résolu",
  "statusClosed": "Fermé",
  "send": "Envoyer",
  "reopen": "Rouvrir",
  "resolvedBanner": "Ce ticket est résolu.",
  "closedBanner": "Ce ticket est fermé.",
  "emptyState": "Aucun ticket. Besoin d'aide ?",
  "unread": "Nouvelle réponse",
  "kpiOpen": "Tickets ouverts",
  "kpiInProgress": "En cours",
  "kpiResolvedMonth": "Résolus ce mois",
  "kpiAvgTime": "Temps moyen",
  "userInfo": "Informations utilisateur",
  "memberSince": "Membre depuis",
  "changeStatus": "Changer le statut",
  "changePriority": "Changer la priorité",
  "teamCantaia": "Équipe Cantaia",
  "dropFiles": "Glissez des fichiers ici ou cliquez",
  "maxFiles": "Max 3 fichiers, 10 Mo chacun",
  "ticketCreated": "Ticket créé avec succès",
  "messageSent": "Message envoyé",
  "allTickets": "Tous les tickets",
  "myTickets": "Mes tickets",
  "writeReply": "Écrire une réponse...",
  "subjectPlaceholder": "Décrivez brièvement votre problème",
  "messagePlaceholder": "Décrivez votre problème en détail..."
}
```

**English:**
```json
"support": {
  "title": "Support",
  "newTicket": "New ticket",
  "subject": "Subject",
  "category": "Category",
  "priority": "Priority",
  "message": "Message",
  "attachments": "Attachments",
  "categoryBug": "Bug / Technical issue",
  "categoryQuestion": "Question / Help",
  "categoryFeature": "Feature request",
  "categoryBilling": "Billing / Subscription",
  "priorityLow": "Low",
  "priorityMedium": "Medium",
  "priorityHigh": "High",
  "statusOpen": "Open",
  "statusInProgress": "In progress",
  "statusResolved": "Resolved",
  "statusClosed": "Closed",
  "send": "Send",
  "reopen": "Reopen",
  "resolvedBanner": "This ticket is resolved.",
  "closedBanner": "This ticket is closed.",
  "emptyState": "No tickets. Need help?",
  "unread": "New reply",
  "kpiOpen": "Open tickets",
  "kpiInProgress": "In progress",
  "kpiResolvedMonth": "Resolved this month",
  "kpiAvgTime": "Average time",
  "userInfo": "User information",
  "memberSince": "Member since",
  "changeStatus": "Change status",
  "changePriority": "Change priority",
  "teamCantaia": "Cantaia Team",
  "dropFiles": "Drop files here or click",
  "maxFiles": "Max 3 files, 10 MB each",
  "ticketCreated": "Ticket created successfully",
  "messageSent": "Message sent",
  "allTickets": "All tickets",
  "myTickets": "My tickets",
  "writeReply": "Write a reply...",
  "subjectPlaceholder": "Briefly describe your issue",
  "messagePlaceholder": "Describe your issue in detail..."
}
```

**German:**
```json
"support": {
  "title": "Support",
  "newTicket": "Neues Ticket",
  "subject": "Betreff",
  "category": "Kategorie",
  "priority": "Priorität",
  "message": "Nachricht",
  "attachments": "Anhänge",
  "categoryBug": "Fehler / Technisches Problem",
  "categoryQuestion": "Frage / Hilfe",
  "categoryFeature": "Funktionsanfrage",
  "categoryBilling": "Abrechnung / Abonnement",
  "priorityLow": "Niedrig",
  "priorityMedium": "Mittel",
  "priorityHigh": "Hoch",
  "statusOpen": "Offen",
  "statusInProgress": "In Bearbeitung",
  "statusResolved": "Gelöst",
  "statusClosed": "Geschlossen",
  "send": "Senden",
  "reopen": "Wiedereröffnen",
  "resolvedBanner": "Dieses Ticket ist gelöst.",
  "closedBanner": "Dieses Ticket ist geschlossen.",
  "emptyState": "Keine Tickets. Brauchen Sie Hilfe?",
  "unread": "Neue Antwort",
  "kpiOpen": "Offene Tickets",
  "kpiInProgress": "In Bearbeitung",
  "kpiResolvedMonth": "Diesen Monat gelöst",
  "kpiAvgTime": "Durchschnittliche Zeit",
  "userInfo": "Benutzerinformationen",
  "memberSince": "Mitglied seit",
  "changeStatus": "Status ändern",
  "changePriority": "Priorität ändern",
  "teamCantaia": "Cantaia-Team",
  "dropFiles": "Dateien hierher ziehen oder klicken",
  "maxFiles": "Max. 3 Dateien, je 10 MB",
  "ticketCreated": "Ticket erfolgreich erstellt",
  "messageSent": "Nachricht gesendet",
  "allTickets": "Alle Tickets",
  "myTickets": "Meine Tickets",
  "writeReply": "Antwort schreiben...",
  "subjectPlaceholder": "Beschreiben Sie Ihr Problem kurz",
  "messagePlaceholder": "Beschreiben Sie Ihr Problem im Detail..."
}
```

Also add `"support"` key to `superAdmin` section in each locale file:
- FR: `"support": "Support"`
- EN: `"support": "Support"`
- DE: `"support": "Support"`

- [ ] **Step 2: Commit**

```bash
git add apps/web/messages/fr.json apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(i18n): add support ticket translations (fr/en/de)"
```

---

### Task 3: API — List & Create tickets

**Files:**
- Create: `apps/web/src/app/api/support/tickets/route.ts`

- [ ] **Step 1: Implement GET + POST**

**GET** `/api/support/tickets`:
- Auth via `createClient()` → `getUser()`; 401 if not authenticated
- Fetch user profile via admin client to check `is_superadmin`
- If superadmin: query all tickets with join on `users(first_name, last_name, email)` and `organizations(name)`
- If regular user: query only `user_id = user.id`
- Apply optional query param filters: `status`, `category`, `priority`
- For each ticket, include `message_count` via a subquery or separate count
- Order by `updated_at DESC`
- Paginate with `page` + `limit` (default 50, max 200) using `parsePagination()` from `@/lib/api/pagination`

**POST** `/api/support/tickets`:
- Auth + get user profile (need `organization_id`)
- Parse body: `{ subject, category, priority, message, attachments? }`
- Validate: subject required (max 200), category in enum, priority in enum, message required (min 10 chars)
- Insert into `support_tickets` with `user_id`, `organization_id`, `last_user_reply_at: now()`
- Insert first message into `support_messages` with `sender_role: 'user'`
- Return created ticket + message

**Pattern reference:** Follow `apps/web/src/app/api/pv/route.ts` for auth + admin client pattern. Use `createAdminClient()` for all DB operations (tables not in TS types, use `as any` cast).

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/support/tickets/route.ts
git commit -m "feat(api): support tickets list and create endpoints"
```

---

### Task 4: API — Ticket detail & status update

**Files:**
- Create: `apps/web/src/app/api/support/tickets/[id]/route.ts`

- [ ] **Step 1: Implement GET + PATCH**

**GET** `/api/support/tickets/[id]`:
- Auth + fetch user profile
- Fetch ticket by ID via admin client
- IDOR check: if not superadmin, verify `ticket.user_id === user.id`, else 403
- Fetch all messages for this ticket ordered by `created_at ASC`
- **Side effect**: update `last_read_at = now()` if user, `last_admin_read_at = now()` if superadmin
- Return `{ ticket, messages }`

**PATCH** `/api/support/tickets/[id]`:
- Auth + verify `is_superadmin`, else 403
- Parse body: `{ status?, priority? }`
- Validate enums
- Update ticket fields
- Return updated ticket

**Next.js 15 async params:** `{ params }: { params: Promise<{ id: string }> }` — await params.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/support/tickets/[id]/route.ts
git commit -m "feat(api): support ticket detail and status update"
```

---

### Task 5: API — Messages & Attachments & Unread count

**Files:**
- Create: `apps/web/src/app/api/support/tickets/[id]/messages/route.ts`
- Create: `apps/web/src/app/api/support/tickets/[id]/attachments/route.ts`
- Create: `apps/web/src/app/api/support/tickets/unread-count/route.ts`

- [ ] **Step 1: Implement POST messages**

`POST /api/support/tickets/[id]/messages`:
- Auth + fetch profile (need `is_superadmin`)
- IDOR: verify ticket ownership or superadmin
- Parse body: `{ content, attachments? }`
- Validate: content required
- Determine `sender_role`: `is_superadmin ? 'admin' : 'user'`
- Insert message
- Update ticket: `updated_at`, plus `last_admin_reply_at` (if admin) or `last_user_reply_at` (if user)
- If user replying to `resolved` ticket → also set `status = 'open'`
- Return created message

- [ ] **Step 2: Implement POST attachments**

`POST /api/support/tickets/[id]/attachments`:
- Auth + IDOR check
- Parse FormData, get file
- Validate file type: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`
- Validate size: max 10 MB
- Sanitize filename: `.replace(/[^a-zA-Z0-9._-]/g, "_")`
- Upload to Supabase Storage bucket `support`, path `{orgId}/{ticketId}/{timestamp}_{filename}`
- Get public URL
- Return `{ file_url, file_name, file_size, file_type }`

- [ ] **Step 3: Implement GET unread-count**

`GET /api/support/tickets/unread-count`:
- Auth + fetch profile
- If superadmin: count tickets where `last_user_reply_at IS NOT NULL AND (last_admin_read_at IS NULL OR last_user_reply_at > last_admin_read_at)`
- If user: count tickets where `user_id = user.id AND last_admin_reply_at IS NOT NULL AND (last_read_at IS NULL OR last_admin_reply_at > last_read_at)`
- Return `{ count }`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/support/tickets/[id]/messages/route.ts apps/web/src/app/api/support/tickets/[id]/attachments/route.ts apps/web/src/app/api/support/tickets/unread-count/route.ts
git commit -m "feat(api): support messages, attachments upload, unread count"
```

---

### Task 6: Shared components (badges, thread, reply input, modal)

**Files:**
- Create: `apps/web/src/components/support/TicketStatusBadge.tsx`
- Create: `apps/web/src/components/support/TicketCategoryBadge.tsx`
- Create: `apps/web/src/components/support/TicketThread.tsx`
- Create: `apps/web/src/components/support/TicketReplyInput.tsx`
- Create: `apps/web/src/components/support/TicketCreateModal.tsx`

- [ ] **Step 1: Create TicketStatusBadge**

Small component mapping status → color:
- `open` → blue badge
- `in_progress` → amber badge
- `resolved` → green badge
- `closed` → gray badge

Uses `useTranslations("support")` for labels (`statusOpen`, etc.).

- [ ] **Step 2: Create TicketCategoryBadge**

Maps category → color:
- `bug` → red badge
- `question` → blue badge
- `feature_request` → purple badge
- `billing` → amber badge

Uses `useTranslations("support")` for labels.

- [ ] **Step 3: Create TicketThread**

Props: `messages: Message[]`, `currentUserId: string`

Renders chronological list:
- User messages: left-aligned with `bg-primary/10` bubble
- Admin messages: right-aligned with `bg-muted` bubble, label "Équipe Cantaia" (`t("teamCantaia")`)
- Each message shows: sender name, timestamp (relative), content text, attachments below (image as thumbnail `max-w-48`, file as icon + filename link)
- Auto-scroll to bottom on new messages via `useRef` + `scrollIntoView`

- [ ] **Step 4: Create TicketReplyInput**

Props: `onSend: (content: string, attachments: Attachment[]) => void`, `disabled?: boolean`

- Textarea with placeholder `t("writeReply")`
- Paperclip icon button → hidden file input (multiple, max 3, accepts image/pdf/xlsx/csv)
- File chips displayed above textarea when files selected (name + remove X)
- Send button (blue, `SendHorizontal` icon)
- Upload files via `POST /api/support/tickets/[id]/attachments` before calling `onSend`
- Loading state while uploading/sending

Pass `ticketId` as prop for attachment upload URL.

- [ ] **Step 5: Create TicketCreateModal**

Props: `open: boolean`, `onClose: () => void`, `onCreated: () => void`

Modal overlay with form:
- Subject input (text, max 200, required)
- Category select (4 options from i18n)
- Priority radios (low/medium/high, default medium)
- Message textarea (required, min 10 chars)
- Attachment drop zone (max 3 files) — files stored in state, uploaded on submit
- Validation: inline error messages on submit
- Submit flow: upload attachments → POST `/api/support/tickets` with `{ subject, category, priority, message, attachments }` → toast "Ticket créé" → `onCreated()` → `onClose()`

Follow `TaskCreateModal.tsx` pattern for modal structure (fixed overlay, bg-background, border-border, etc.).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/support/
git commit -m "feat(support): shared components - badges, thread, reply input, modal"
```

---

### Task 7: User pages — list & detail

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/support/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/support/[id]/page.tsx`

- [ ] **Step 1: Create support list page**

`"use client"` page:
- Header: `t("title")` + button `"+ " + t("newTicket")` → opens `TicketCreateModal`
- Filters row: status dropdown (Tous/Ouvert/En cours/Résolu/Fermé), category dropdown
- Fetch `GET /api/support/tickets` on mount + when filters change
- Table with columns: Subject, Category (`TicketCategoryBadge`), Priority (colored dot), Status (`TicketStatusBadge`), Date (`formatDate`), unread indicator (blue dot if `last_admin_reply_at > last_read_at`)
- Click row → `router.push(\`/support/${ticket.id}\`)`
- Empty state: icon `LifeBuoy` + `t("emptyState")` + button `t("newTicket")`
- Use `Link` from `@/i18n/navigation`

- [ ] **Step 2: Create support detail page**

`"use client"` page with `{ params }: { params: Promise<{ id: string }> }`:
- Fetch `GET /api/support/tickets/[id]` on mount (this auto-updates `last_read_at`)
- Header: back arrow → `/support`, subject, `TicketCategoryBadge`, `TicketStatusBadge`, priority dot, `formatDate(ticket.created_at)`
- `TicketThread` component with messages
- If status `resolved` or `closed`: banner with `t("resolvedBanner")` / `t("closedBanner")` + "Rouvrir" button (calls POST messages with a "Rouvrir" content, which auto-reopens)
- `TicketReplyInput` at bottom (sticky) — disabled if status `closed`
- On send: POST `/api/support/tickets/[id]/messages` → refetch messages

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/(app)/support/
git commit -m "feat(support): user ticket list and detail pages"
```

---

### Task 8: Super-admin pages — list & detail

**Files:**
- Create: `apps/web/src/app/[locale]/(super-admin)/super-admin/support/page.tsx`
- Create: `apps/web/src/app/[locale]/(super-admin)/super-admin/support/[id]/page.tsx`

- [ ] **Step 1: Create super-admin support list page**

`"use client"` page:
- 4 KPI cards at top:
  - Tickets ouverts: count where `status = 'open'`
  - En cours: count where `status = 'in_progress'`
  - Résolus ce mois: count where `status = 'resolved'` and `updated_at` this month
  - Temps moyen: average time from `created_at` to first `status = 'resolved'` (compute client-side from ticket data, or show "—" if no data)
- Filters: status, category, priority, organization dropdown (populated from ticket data)
- Table: Subject, User (name + email), Organization, Category badge, Priority dot, Status badge, Date, unread dot (if `last_user_reply_at > last_admin_read_at`)
- Click row → `router.push(\`/super-admin/support/${ticket.id}\`)`
- Fetch `GET /api/support/tickets` (superadmin sees all)

- [ ] **Step 2: Create super-admin support detail page**

Same thread layout as user detail, plus:
- Status dropdown at top right (select with 4 options) — on change, `PATCH /api/support/tickets/[id]` with `{ status }`
- User info card in sidebar or header: name, email, organization, plan, member since (from ticket data enriched by API)
- `TicketThread` + `TicketReplyInput` (same components, reused)
- On open, auto-updates `last_admin_read_at` via the GET call

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/(super-admin)/super-admin/support/
git commit -m "feat(support): super-admin ticket list and detail pages"
```

---

### Task 9: Sidebar integration + middleware

**Files:**
- Modify: `apps/web/src/components/app/Sidebar.tsx`
- Modify: `apps/web/src/app/[locale]/(super-admin)/layout.tsx`
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Add Support to app sidebar**

In `Sidebar.tsx`:
- Import `LifeBuoy` from `lucide-react`
- Add state: `const [supportUnread, setSupportUnread] = useState(0);`
- Add `useEffect` to fetch `GET /api/support/tickets/unread-count` on mount + poll every 60s (with `setInterval` + cleanup)
- Add to `bottomItems` array, BEFORE the settings item (index 0):
  ```typescript
  { href: "/support", labelKey: "support", icon: LifeBuoy, status: "active" as const, badge: supportUnread > 0 ? String(supportUnread) : undefined }
  ```
  So `bottomItems` becomes `[support, settings]`.
- In mobile `mobileExtraItems`, add Support entry too.

- [ ] **Step 2: Add Support to super-admin sidebar**

In `apps/web/src/app/[locale]/(super-admin)/layout.tsx`:
- Import `LifeBuoy` from `lucide-react`
- Add to `superAdminNavItems` array, after `operations` and before `config`:
  ```typescript
  { href: "/super-admin/support", icon: LifeBuoy, labelKey: "support" },
  ```

- [ ] **Step 3: Add /support to middleware protected paths**

In `middleware.ts`, add `"/support"` to the `protectedPaths` array.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/app/Sidebar.tsx apps/web/src/app/[locale]/(super-admin)/layout.tsx apps/web/src/middleware.ts
git commit -m "feat(support): sidebar integration with unread badge + middleware"
```

---

### Task 10: Build verification & push

- [ ] **Step 1: Run build**

```bash
cd apps/web && npx next build
```

Fix any TypeScript errors. Common issues:
- `as any` casts needed for tables not in Database types (`support_tickets`, `support_messages`)
- Next.js 15 async params pattern
- Unused imports

- [ ] **Step 2: Push to remote**

```bash
git push
```

---

## Dependency Graph

```
Task 1 (migration) ─────────────────────────────────────────┐
Task 2 (i18n) ───────────────────────────────────────────────┤
                                                             ├─► Task 10 (build + push)
Task 3 (API list/create) ──► Task 4 (API detail) ──►        │
                              Task 5 (API msg/attach/unread) ┤
                                                             │
Task 6 (components) ──► Task 7 (user pages) ──►              │
                        Task 8 (admin pages) ──►             │
                                                             │
Task 9 (sidebar + middleware) ───────────────────────────────┘
```

Tasks 1, 2, 3, 6 can start in parallel.
Tasks 4, 5 depend on 3.
Tasks 7, 8 depend on 6 + API tasks.
Task 9 depends on nothing but should be done after 2 (i18n keys).
Task 10 depends on all.
