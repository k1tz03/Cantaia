# Support Tickets System — Design Spec

> Date: 2026-03-21
> Status: Approved

## Overview

Ticket-based support system for Cantaia. Users create tickets from the app sidebar, exchange messages with super-admins in a threaded conversation. Super-admins manage all tickets from a dedicated dashboard.

## Database (Migration 059)

### Table `support_tickets`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `user_id` | UUID FK auth.users | NOT NULL |
| `organization_id` | UUID FK organizations | NOT NULL |
| `subject` | TEXT | NOT NULL, max 200 chars |
| `category` | TEXT | `bug`, `question`, `feature_request`, `billing` |
| `priority` | TEXT | `low`, `medium`, `high` |
| `status` | TEXT | `open`, `in_progress`, `resolved`, `closed` |
| `last_read_at` | TIMESTAMPTZ | User last opened this ticket |
| `last_admin_reply_at` | TIMESTAMPTZ | Last message from admin |
| `last_user_reply_at` | TIMESTAMPTZ | Last message from user |
| `last_admin_read_at` | TIMESTAMPTZ | Admin last opened this ticket |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

**RLS**: `user_id = auth.uid()` for user access. Service role for super-admin.

### Table `support_messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `ticket_id` | UUID FK support_tickets | NOT NULL, ON DELETE CASCADE |
| `sender_id` | UUID FK auth.users | NOT NULL |
| `sender_role` | TEXT | `user` or `admin` |
| `content` | TEXT | NOT NULL |
| `attachments` | JSONB | Array of `{ file_url, file_name, file_size, file_type }`, default `[]` |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**RLS**: User can read messages on their own tickets. Service role for super-admin.

### Storage

- Bucket: `support` (private, max 10 MB per file)
- Path: `{orgId}/{ticketId}/{filename}`
- Allowed types: JPEG, PNG, WebP, PDF, XLSX, CSV
- Filename sanitized: `.replace(/[^a-zA-Z0-9._-]/g, "_")`

## API Routes (7 endpoints)

### `GET /api/support/tickets`

- Auth required
- If `is_superadmin`: returns all tickets with user info (name, email, org)
- Else: returns only user's tickets (`user_id = auth.uid()`)
- Query params: `status`, `category`, `priority`, `page`, `limit`
- Response includes message count per ticket
- Ordered by `updated_at DESC`

### `POST /api/support/tickets`

- Auth required
- Body: `{ subject, category, priority, message, attachments? }`
- Creates ticket + first message in one transaction
- Sets `last_user_reply_at = now()`
- Returns created ticket

### `GET /api/support/tickets/[id]`

- Auth required + IDOR check (`user_id = auth.uid()` or `is_superadmin`)
- Returns ticket + all messages ordered by `created_at ASC`
- **Side effect**: Updates `last_read_at` (if user) or `last_admin_read_at` (if admin)

### `PATCH /api/support/tickets/[id]`

- Super-admin only
- Body: `{ status?, priority? }`
- Updates `updated_at`

### `POST /api/support/tickets/[id]/messages`

- Auth required + IDOR check
- Body: `{ content, attachments? }`
- Creates message with `sender_role` based on `is_superadmin`
- Updates ticket `updated_at` + `last_user_reply_at` or `last_admin_reply_at`
- If user replies to a `resolved` ticket → status changes back to `open`

### `POST /api/support/tickets/[id]/attachments`

- Auth required + IDOR check
- FormData with file
- Validates: type (image/pdf/xlsx/csv), size (max 10 MB)
- Uploads to `support/{orgId}/{ticketId}/{sanitizedFilename}`
- Returns `{ file_url, file_name, file_size, file_type }`

### `GET /api/support/tickets/unread-count`

- Auth required
- If user: counts tickets where `last_admin_reply_at > last_read_at`
- If super-admin: counts tickets where `last_user_reply_at > last_admin_read_at`
- Returns `{ count: number }`

## Pages

### User: `/support` (list)

- Header: "Support" + button "+ Nouveau ticket"
- Filters: status (Tous/Ouvert/En cours/Résolu/Fermé), category dropdown
- Table columns: Subject, Category (colored badge), Priority (dot), Status (badge), Date, Unread indicator (blue dot)
- Click row → navigate to `/support/[id]`
- Empty state: "Aucun ticket. Besoin d'aide ?"

### User: `/support/[id]` (detail)

- Header: subject, category badge, status badge, priority dot, created date
- Thread: chronological messages
  - User messages: left-aligned, blue-tinted bubble
  - Admin messages: right-aligned, muted bubble, "Équipe Cantaia" label
  - Attachments rendered below each message (image thumbnail or file icon + name)
- Reply input (bottom, sticky): textarea + upload button (paperclip icon) + send button
- If status `resolved` or `closed`: banner "Ce ticket est résolu" with "Rouvrir" button
- Back arrow → `/support`

### Super-Admin: `/super-admin/support` (list)

- 4 KPI cards: Tickets ouverts, En cours, Résolus ce mois, Temps moyen résolution
- Filters: status, category, priority, organization dropdown
- Table columns: Subject, User (name + email), Organization, Category, Priority, Status, Date, Unread indicator
- Click row → navigate to `/super-admin/support/[id]`

### Super-Admin: `/super-admin/support/[id]` (detail)

- Same thread layout as user detail
- Additional: status dropdown (change status), user info card (name, email, org, plan, member since)
- Reply input same as user side
- Back arrow → `/super-admin/support`

### Modal: New Ticket

- Triggered by "+ Nouveau ticket" button
- Fields:
  - Subject* (text input, max 200 chars)
  - Category* (select: Bug, Question, Demande de fonctionnalité, Facturation)
  - Priority* (radio: Basse, Moyenne, Haute — default Moyenne)
  - Message* (textarea, min 10 chars)
  - Attachments (drop zone, max 3 files, 10 MB each)
- Submit → POST `/api/support/tickets` → close modal → refresh list
- Validation errors inline

## Sidebar Integration

### App Sidebar (`Sidebar.tsx`)

- New nav item: `{ href: "/support", labelKey: "support", icon: LifeBuoy }`
- Position: above "Paramètres" (Settings), below Admin link
- Badge: red circle with unread count from `/api/support/tickets/unread-count`
- Badge fetched on mount + polling every 60 seconds
- Mobile: included in "Plus" menu

### Super-Admin Sidebar (layout.tsx)

- New nav item: `{ name: "Support", href: "/super-admin/support", icon: LifeBuoy }`
- Position: after "Operations", before "Config"
- Badge: unread count (tickets with new user replies)

## i18n Keys

Add to `nav` section:
- `support`: "Support" / "Support" / "Support"

Add new `support` section in all 3 locale files (fr/en/de):
- `title`, `newTicket`, `subject`, `category`, `priority`, `message`, `attachments`
- `categoryBug`, `categoryQuestion`, `categoryFeature`, `categoryBilling`
- `priorityLow`, `priorityMedium`, `priorityHigh`
- `statusOpen`, `statusInProgress`, `statusResolved`, `statusClosed`
- `send`, `reopen`, `resolved_banner`, `empty_state`, `unread`
- `kpiOpen`, `kpiInProgress`, `kpiResolvedMonth`, `kpiAvgTime`
- `userInfo`, `memberSince`, `changePriority`, `changeStatus`

## Middleware

Add `/support` to protected routes in `middleware.ts`.

## File Structure

```
apps/web/src/app/[locale]/(app)/support/
  ├── page.tsx                    # User ticket list
  └── [id]/page.tsx               # User ticket detail + thread

apps/web/src/app/[locale]/(super-admin)/super-admin/support/
  ├── page.tsx                    # Admin ticket list + KPIs
  └── [id]/page.tsx               # Admin ticket detail + thread

apps/web/src/app/api/support/
  ├── tickets/route.ts            # GET list, POST create
  └── tickets/[id]/
      ├── route.ts                # GET detail, PATCH status
      ├── messages/route.ts       # POST new message
      └── attachments/route.ts    # POST upload file

apps/web/src/components/support/
  ├── TicketCreateModal.tsx        # New ticket form
  ├── TicketList.tsx               # Shared table component
  ├── TicketThread.tsx             # Message thread display
  ├── TicketReplyInput.tsx         # Reply textarea + upload
  ├── TicketStatusBadge.tsx        # Status colored badge
  └── TicketCategoryBadge.tsx      # Category colored badge

packages/database/migrations/
  └── 059_support_tickets.sql
```
