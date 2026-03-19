# Admin/Super-Admin Refonte & cantaia.io Migration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the admin org panel into a unified 4-tab interface, complete the super-admin dashboard with working AI cost tracking, integrate Stripe billing, and migrate all domain references to cantaia.io.

**Architecture:** 10 sequential tasks following the spec's implementation order. Task 1 fixes the critical api_usage_logs tracking bug. Task 2 migrates domain references. Tasks 3-4 add plan features config and Stripe routes. Tasks 5-6 rewrite admin org and add new super-admin pages. Tasks 7-8 enhance existing super-admin pages and add trial expiration. Task 9 adds impersonation. Task 10 updates CLAUDE.md.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (PostgreSQL + Auth + Storage), Stripe API, Tailwind CSS, shadcn/ui, Recharts, next-intl (FR/EN/DE)

**Spec:** `docs/superpowers/specs/2026-03-19-admin-superadmin-design.md`

---

## File Structure Overview

### New Files

| File | Responsibility |
|------|---------------|
| `packages/database/migrations/054_stripe_plan_columns.sql` | Add `plan_status`, `plan_period_end` to `organizations` |
| `packages/config/src/plan-features.ts` | `PLAN_FEATURES`, `canAccess()`, `getUsageCount()`, `checkUsageLimit()` |
| `apps/web/src/app/api/stripe/create-checkout/route.ts` | Stripe Checkout Session creation |
| `apps/web/src/app/api/stripe/update-subscription/route.ts` | Plan change with proration |
| `apps/web/src/app/api/stripe/cancel-subscription/route.ts` | Cancel at period end |
| `apps/web/src/app/api/stripe/add-seats/route.ts` | Add extra users (Pro plan) |
| `apps/web/src/app/api/stripe/invoices/route.ts` | List invoices with PDF links |
| `apps/web/src/app/api/stripe/create-portal-session/route.ts` | Billing portal for payment method |
| `apps/web/src/app/api/admin/team-health/route.ts` | Team health data (overdue tasks, activity) |
| `apps/web/src/app/api/admin/activity-feed/route.ts` | Org activity feed (7 days) |
| `apps/web/src/app/api/super-admin/impersonate/route.ts` | Generate magic link for impersonation |
| `apps/web/src/app/api/super-admin/force-sync/route.ts` | Force email sync for a user |
| `apps/web/src/app/api/super-admin/force-briefing/route.ts` | Force briefing generation |
| `apps/web/src/components/admin/AdminOverviewTab.tsx` | Activity feed + team health + org KPIs |
| `apps/web/src/components/admin/AdminMembersTab.tsx` | Member management (invite, roles, delete) |
| `apps/web/src/components/admin/AdminSubscriptionTab.tsx` | Stripe plan, invoices, payment method |
| `apps/web/src/components/admin/AdminSettingsTab.tsx` | Branding, alerts, org config |
| `apps/web/src/components/admin/TeamHealthCard.tsx` | Per-member health indicator card |
| `apps/web/src/components/admin/ActivityFeed.tsx` | Activity feed component |
| `apps/web/src/components/stripe/PlanSelector.tsx` | Plan selection modal (3 plans) |
| `apps/web/src/components/stripe/InvoicesList.tsx` | Invoice list with PDF links |
| `apps/web/src/components/stripe/UsageLimitBanner.tsx` | Usage limit warning/blocked banner |
| `apps/web/src/components/super-admin/ImpersonationBanner.tsx` | Red banner when impersonating |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/ai-costs/page.tsx` | AI costs analytics page |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/operations/page.tsx` | Operational tools page |

### Modified Files

| File | What Changes |
|------|-------------|
| `packages/core/src/tracking/api-cost-tracker.ts` | Add error logging in catch block |
| `packages/config/constants.ts` | Update `SUBSCRIPTION_PLANS` to match new pricing |
| `apps/web/src/middleware.ts` | Domain `cantaia.io` |
| `apps/web/next.config.ts` | Domain redirects, CSP update |
| `apps/web/src/lib/env.ts` | `BASE_DOMAIN` validation |
| `apps/web/src/app/[locale]/(admin)/admin/page.tsx` | Complete rewrite → 4-tab interface |
| `apps/web/src/app/[locale]/(admin)/layout.tsx` | Simplify sidebar (single /admin link) |
| `apps/web/src/app/api/webhooks/stripe/route.ts` | Fix to use `subscription_plan`, add new handlers |
| `apps/web/src/app/api/super-admin/route.ts` | New actions: `ai-costs-summary`, `operations-status` |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/page.tsx` | Fix KPIs, add alerts |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/organizations/page.tsx` | Add AI cost columns |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/users/page.tsx` | Add AI cost columns, impersonate |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/billing/page.tsx` | Real MRR/ARR |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/config/page.tsx` | Plan limits editor |
| `apps/web/src/app/[locale]/(super-admin)/layout.tsx` | Add AI Costs + Operations nav items |
| Various SEO files (sitemap, robots, metadata, OG, JSON-LD) | cantaia.ch → cantaia.io |
| `apps/web/messages/fr.json`, `en.json`, `de.json` | New i18n keys for admin/stripe/plans |
| `CLAUDE.md` | Domain, new routes, new pages, plan pricing |

### Deleted Files/Directories

| Path | Reason |
|------|--------|
| `apps/web/src/app/[locale]/(admin)/admin/members/` | Merged into AdminMembersTab |
| `apps/web/src/app/[locale]/(admin)/admin/finances/` | Merged into AdminSubscriptionTab |
| `apps/web/src/app/[locale]/(admin)/admin/branding/` | Merged into AdminSettingsTab |
| `apps/web/src/app/[locale]/(admin)/admin/time-savings/` | Moved to super-admin |

---

## Task 1: Fix api_usage_logs Tracking Bug

> **Prerequisite for all AI cost features. Must be done first.**

**Files:**
- Modify: `packages/core/src/tracking/api-cost-tracker.ts`
- Check: `packages/database/migrations/004_api_usage_logs.sql` (schema reference)

- [ ] **Step 1: Read the current api-cost-tracker.ts**

Read `packages/core/src/tracking/api-cost-tracker.ts` fully. Note the `trackApiUsage()` function — it has a fire-and-forget catch that silently swallows errors.

- [ ] **Step 2: Add error logging to the catch block**

```typescript
// In trackApiUsage(), replace the silent catch:
// BEFORE:
} catch (error) {
  // Fire and forget - don't break the main flow
}

// AFTER:
} catch (error) {
  console.error('[api-cost-tracker] Failed to track API usage:', {
    action_type: params.actionType,
    error: error instanceof Error ? error.message : String(error),
    user_id: params.userId,
    org_id: params.organizationId,
  });
}
```

- [ ] **Step 3: Verify the insert column names match migration 004**

Read `packages/database/migrations/004_api_usage_logs.sql`. Compare column names in the migration with those used in `trackApiUsage()`. If there's a mismatch, fix the column names in the insert.

- [ ] **Step 4: Check a sample call site to verify admin client is passed**

Read one of the routes that calls `trackApiUsage()`, e.g., `apps/web/src/app/api/ai/classify-email/route.ts`. Verify that the `supabase` parameter passed is the admin client (`createAdminClient()`), not the user client (`createClient()`). If it's user client, fix it.

- [ ] **Step 5: Spot-check 3 more call sites**

Check `apps/web/src/app/api/ai/generate-reply/route.ts`, `apps/web/src/app/api/chat/route.ts`, and `apps/web/src/app/api/plans/estimate-v2/route.ts`. Verify all pass admin client. Fix any that don't.

- [ ] **Step 6: Build to verify no TypeScript errors**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors from our changes.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/tracking/api-cost-tracker.ts
# Plus any route files that were fixed
git commit -m "fix(tracking): add error logging to trackApiUsage and verify call sites"
```

---

## Task 2: Domain Migration cantaia.ch → cantaia.io

> **Search-and-replace across entire codebase. Do early to avoid conflicts.**

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/src/lib/env.ts`
- Modify: All SEO files (sitemap, robots, metadata, OG image, JSON-LD, manifest)
- Modify: `packages/core/src/submissions/price-request-generator.ts`
- Modify: `packages/core/src/submissions/tracking-code.ts`
- Modify: `apps/web/messages/fr.json`, `en.json`, `de.json` (if URLs present)
- Modify: `.env.example`

- [ ] **Step 1: Grep for all domain references**

Run: `grep -rn "cantaia\.ch\|cantaia\.com\|cantaia\.app" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.js" --include="*.mjs" . | grep -v node_modules | grep -v .next`

Record every file and line. This is the master list.

- [ ] **Step 2: Update middleware.ts**

In `apps/web/src/middleware.ts`:
- Change `BASE_DOMAIN` default from `"cantaia.ch"` to `"cantaia.io"` (line ~39)
- All subdomain detection logic stays the same, just the domain changes

- [ ] **Step 3: Update next.config.ts**

In `apps/web/next.config.ts`:
- Remove all 301 redirects for `cantaia.com`, `www.cantaia.com`, `cantaia.app`, `www.cantaia.ch`
- Add single redirect: `www.cantaia.io` → `cantaia.io` (301)
- Update CSP header: replace any `cantaia.ch` references in `connect-src` with `cantaia.io`

- [ ] **Step 4: Update env.ts**

In `apps/web/src/lib/env.ts`:
- Update any default or validation for `BASE_DOMAIN` to `cantaia.io`

- [ ] **Step 5: Update .env.example**

```
BASE_DOMAIN=cantaia.io
NEXT_PUBLIC_APP_URL=https://cantaia.io
```

- [ ] **Step 6: Update SEO files**

Replace `cantaia.ch` with `cantaia.io` in:
- `apps/web/src/app/sitemap.ts`
- `apps/web/src/app/robots.ts`
- `apps/web/src/app/[locale]/layout.tsx` (metadata)
- `apps/web/src/app/[locale]/(marketing)/page.tsx` (JSON-LD)
- `apps/web/src/app/[locale]/(marketing)/layout.tsx` (JSON-LD)
- `apps/web/src/app/[locale]/(marketing)/pricing/page.tsx` (metadata)
- `apps/web/src/app/[locale]/(marketing)/about/page.tsx` (metadata)
- `apps/web/src/app/opengraph-image.tsx`
- `apps/web/public/manifest.json`
- Legal pages metadata (`cgv`, `mentions`, `privacy`)

- [ ] **Step 7: Update core package domain references**

Replace `cantaia.ch` with `cantaia.io` in:
- `packages/core/src/submissions/price-request-generator.ts` (supplier portal URLs)
- `packages/core/src/submissions/tracking-code.ts` (tracking link URLs)
- Any other files found in Step 1

- [ ] **Step 8: Update i18n messages if needed**

Search `apps/web/messages/fr.json`, `en.json`, `de.json` for `cantaia.ch`. Replace with `cantaia.io`.

- [ ] **Step 9: Build to verify**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: migrate all domain references from cantaia.ch to cantaia.io"
```

---

## Task 3: Plan Features Configuration & Usage Limits

> **Central config used by Stripe routes, feature gating, and usage limit middleware.**

**Files:**
- Create: `packages/config/src/plan-features.ts`
- Modify: `packages/config/constants.ts` (update SUBSCRIPTION_PLANS)
- Modify: `packages/config/package.json` (add export)
- Create: `packages/database/migrations/054_stripe_plan_columns.sql`

- [ ] **Step 1: Create migration 054**

Create `packages/database/migrations/054_stripe_plan_columns.sql`:

```sql
-- Migration 054: Add Stripe plan management columns to organizations
-- Required for: Stripe webhook handlers, subscription lifecycle tracking

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'active';
-- Values: active, past_due, canceled, trialing

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_period_end TIMESTAMPTZ;
-- End date of current billing period (for cancel_at_period_end)

COMMENT ON COLUMN organizations.plan_status IS 'Stripe subscription status: active, past_due, canceled, trialing';
COMMENT ON COLUMN organizations.plan_period_end IS 'End of current Stripe billing period';
```

- [ ] **Step 2: Update SUBSCRIPTION_PLANS in constants.ts**

In `packages/config/constants.ts`, replace the current `SUBSCRIPTION_PLANS` (lines 24-34) with:

```typescript
export const SUBSCRIPTION_PLANS = {
  trial:      { name: "Trial",      maxUsers: 1,   maxProjects: 2,    price: 0 },
  starter:    { name: "Starter",    maxUsers: 1,   maxProjects: 5,    price: 149 },
  pro:        { name: "Pro",        maxUsers: 3,   maxProjects: -1,   price: 349 },
  enterprise: { name: "Enterprise", maxUsers: -1,  maxProjects: -1,   price: 790 },
} as const;
```

- [ ] **Step 3: Create plan-features.ts**

Create `packages/config/plan-features.ts` (at root of config package, matching existing pattern like `constants.ts`):

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanName = "trial" | "starter" | "pro" | "enterprise";

export type FeatureName =
  | "budgetAI"
  | "planning"
  | "dataIntel"
  | "branding"
  | "export";

export interface PlanLimits {
  maxProjects: number;
  maxUsers: number;
  aiCalls: number;
  maxEmailsSync: number;
  maxPlanAnalyses: number;
  maxSubmissions: number;
  maxStorage: number;
  budgetAI: boolean;
  planning: false | "basic" | "full";
  dataIntel: boolean;
  branding: boolean;
  export: boolean;
}

export const PLAN_FEATURES: Record<PlanName, PlanLimits> = {
  trial: {
    maxProjects: 2,
    maxUsers: 1,
    aiCalls: 20,
    maxEmailsSync: 50,
    maxPlanAnalyses: 2,
    maxSubmissions: 1,
    maxStorage: 100_000_000,
    budgetAI: false,
    planning: false,
    dataIntel: false,
    branding: false,
    export: false,
  },
  starter: {
    maxProjects: 5,
    maxUsers: 1,
    aiCalls: 200,
    maxEmailsSync: 500,
    maxPlanAnalyses: 10,
    maxSubmissions: 5,
    maxStorage: 2_000_000_000,
    budgetAI: true,
    planning: "basic",
    dataIntel: false,
    branding: false,
    export: true,
  },
  pro: {
    maxProjects: Infinity,
    maxUsers: 3,
    aiCalls: 1000,
    maxEmailsSync: Infinity,
    maxPlanAnalyses: 50,
    maxSubmissions: Infinity,
    maxStorage: 10_000_000_000,
    budgetAI: true,
    planning: "full",
    dataIntel: true,
    branding: true,
    export: true,
  },
  enterprise: {
    maxProjects: Infinity,
    maxUsers: Infinity,
    aiCalls: Infinity,
    maxEmailsSync: Infinity,
    maxPlanAnalyses: Infinity,
    maxSubmissions: Infinity,
    maxStorage: Infinity,
    budgetAI: true,
    planning: "full",
    dataIntel: true,
    branding: true,
    export: true,
  },
};

/**
 * Check if a plan has access to a specific feature.
 * Used both client-side (UI gating) and server-side (API gating).
 */
export function canAccess(plan: PlanName | string, feature: FeatureName): boolean {
  const limits = PLAN_FEATURES[plan as PlanName];
  if (!limits) return false;

  const value = limits[feature];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return true; // "basic" or "full"
  return false;
}

/**
 * Get the minimum plan required for a feature.
 * Used for "Upgrade to X" messaging.
 */
export function requiredPlanFor(feature: FeatureName): PlanName {
  const plans: PlanName[] = ["trial", "starter", "pro", "enterprise"];
  for (const plan of plans) {
    if (canAccess(plan, feature)) return plan;
  }
  return "enterprise";
}

/**
 * Count AI calls for an org this month.
 * Uses admin client to bypass RLS.
 */
export async function getUsageCount(
  supabase: SupabaseClient,
  organizationId: string
): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("api_usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", startOfMonth.toISOString());

  if (error) {
    console.error("[plan-features] Failed to count usage:", error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Check if an org has exceeded its AI usage limit.
 * Returns null if OK, or an error object if limit reached.
 *
 * Call this at the top of every AI route BEFORE doing the AI call.
 * Does NOT count cron/system calls (pass skipCheck=true for those).
 */
export async function checkUsageLimit(
  supabase: SupabaseClient,
  organizationId: string,
  plan: PlanName | string
): Promise<{ allowed: true } | { allowed: false; current: number; limit: number; requiredPlan: PlanName }> {
  const limits = PLAN_FEATURES[plan as PlanName];
  if (!limits) {
    return { allowed: false, current: 0, limit: 0, requiredPlan: "starter" };
  }

  if (limits.aiCalls === Infinity) {
    return { allowed: true };
  }

  const current = await getUsageCount(supabase, organizationId);

  if (current >= limits.aiCalls) {
    // Find the next plan up
    const plans: PlanName[] = ["trial", "starter", "pro", "enterprise"];
    const currentIdx = plans.indexOf(plan as PlanName);
    const nextPlan = plans[Math.min(currentIdx + 1, plans.length - 1)] as PlanName;

    return { allowed: false, current, limit: limits.aiCalls, requiredPlan: nextPlan };
  }

  return { allowed: true };
}
```

- [ ] **Step 4: Add export to @cantaia/config package.json**

In `packages/config/package.json`, add to exports (matching existing pattern like `"./constants"`):

```json
"./plan-features": {
  "types": "./plan-features.ts",
  "default": "./plan-features.ts"
}
```

- [ ] **Step 5: Build to verify**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/config/ packages/database/migrations/054_stripe_plan_columns.sql
git commit -m "feat: add plan features config, usage limits, and migration 054"
```

---

## Task 4: Stripe API Routes

> **6 new routes for full Stripe integration. All require auth + org admin check.**

**Files:**
- Create: `apps/web/src/app/api/stripe/create-checkout/route.ts`
- Create: `apps/web/src/app/api/stripe/update-subscription/route.ts`
- Create: `apps/web/src/app/api/stripe/cancel-subscription/route.ts`
- Create: `apps/web/src/app/api/stripe/add-seats/route.ts`
- Create: `apps/web/src/app/api/stripe/invoices/route.ts`
- Create: `apps/web/src/app/api/stripe/create-portal-session/route.ts`
- Modify: `apps/web/src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Create create-checkout route**

Create `apps/web/src/app/api/stripe/create-checkout/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });

// Map plan names to Stripe price IDs (set these in env vars)
const PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER || "",
  pro: process.env.STRIPE_PRICE_PRO || "",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || "",
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id, role, email")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = await request.json();
    const { plan } = body;

    if (!plan || !PRICE_IDS[plan]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get or create Stripe customer
    const { data: org } = await admin
      .from("organizations")
      .select("stripe_customer_id, name")
      .eq("id", profile.organization_id)
      .single();

    let customerId = org?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || user.email,
        name: org?.name || undefined,
        metadata: { organization_id: profile.organization_id },
      });
      customerId = customer.id;

      await admin
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", profile.organization_id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.io";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      currency: "chf",
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      success_url: `${appUrl}/fr/admin?tab=subscription&success=true`,
      cancel_url: `${appUrl}/fr/admin?tab=subscription&canceled=true`,
      metadata: {
        organization_id: profile.organization_id,
        plan,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[stripe/create-checkout]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create update-subscription route**

Create `apps/web/src/app/api/stripe/update-subscription/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });

const PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER || "",
  pro: process.env.STRIPE_PRICE_PRO || "",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || "",
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: org } = await admin
      .from("organizations")
      .select("stripe_subscription_id")
      .eq("id", profile.organization_id)
      .single();

    if (!org?.stripe_subscription_id) {
      return NextResponse.json({ error: "No active subscription" }, { status: 400 });
    }

    const body = await request.json();
    const { plan } = body;

    if (!plan || !PRICE_IDS[plan]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
    const mainItem = subscription.items.data[0];

    await stripe.subscriptions.update(org.stripe_subscription_id, {
      items: [{ id: mainItem.id, price: PRICE_IDS[plan] }],
      proration_behavior: "create_prorations",
      metadata: { plan },
    });

    // Webhook will update subscription_plan in DB
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[stripe/update-subscription]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create cancel-subscription route**

Create `apps/web/src/app/api/stripe/cancel-subscription/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: org } = await admin
      .from("organizations")
      .select("stripe_subscription_id")
      .eq("id", profile.organization_id)
      .single();

    if (!org?.stripe_subscription_id) {
      return NextResponse.json({ error: "No active subscription" }, { status: 400 });
    }

    await stripe.subscriptions.update(org.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[stripe/cancel-subscription]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create add-seats route**

Create `apps/web/src/app/api/stripe/add-seats/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: org } = await admin
      .from("organizations")
      .select("stripe_subscription_id, subscription_plan")
      .eq("id", profile.organization_id)
      .single();

    if (!org?.stripe_subscription_id) {
      return NextResponse.json({ error: "No active subscription" }, { status: 400 });
    }

    if (org.subscription_plan !== "pro") {
      return NextResponse.json({ error: "Extra seats only available on Pro plan" }, { status: 400 });
    }

    const body = await request.json();
    const { additionalSeats } = body;

    if (!additionalSeats || additionalSeats < 1) {
      return NextResponse.json({ error: "Invalid seat count" }, { status: 400 });
    }

    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);

    // Find or create the extra_user line item
    const extraUserPriceId = process.env.STRIPE_PRICE_PRO_EXTRA_USER || "";
    const existingItem = subscription.items.data.find(
      (item) => item.price.id === extraUserPriceId
    );

    if (existingItem) {
      await stripe.subscriptionItems.update(existingItem.id, {
        quantity: (existingItem.quantity || 0) + additionalSeats,
      });
    } else {
      await stripe.subscriptionItems.create({
        subscription: org.stripe_subscription_id,
        price: extraUserPriceId,
        quantity: additionalSeats,
      });
    }

    // Update max_users in DB
    const { data: members } = await admin
      .from("users")
      .select("id", { count: "exact" })
      .eq("organization_id", profile.organization_id);

    const currentCount = members?.length || 0;
    await admin
      .from("organizations")
      .update({ max_users: 3 + additionalSeats + (existingItem?.quantity || 0) })
      .eq("id", profile.organization_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[stripe/add-seats]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Create invoices route**

Create `apps/web/src/app/api/stripe/invoices/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: org } = await admin
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", profile.organization_id)
      .single();

    if (!org?.stripe_customer_id) {
      return NextResponse.json({ invoices: [] });
    }

    const invoices = await stripe.invoices.list({
      customer: org.stripe_customer_id,
      limit: 24,
    });

    const formatted = invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      date: inv.created,
      amount: inv.amount_paid / 100,
      currency: inv.currency,
      status: inv.status,
      pdf_url: inv.invoice_pdf,
      hosted_url: inv.hosted_invoice_url,
    }));

    return NextResponse.json({ invoices: formatted });
  } catch (error) {
    console.error("[stripe/invoices]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Create create-portal-session route**

Create `apps/web/src/app/api/stripe/create-portal-session/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: org } = await admin
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", profile.organization_id)
      .single();

    if (!org?.stripe_customer_id) {
      return NextResponse.json({ error: "No Stripe customer" }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.io";

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${appUrl}/fr/admin?tab=subscription`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[stripe/create-portal-session]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 7: Update Stripe webhook to use subscription_plan and add new handlers**

Modify `apps/web/src/app/api/webhooks/stripe/route.ts`.

Read the file first. Then apply these **specific** edits:

**7a. `checkout.session.completed` handler** — replace the update object:
```typescript
// BEFORE (writes to `plan` only):
// .update({ stripe_customer_id, stripe_subscription_id, plan: session.metadata.plan || "pro", plan_status: "active" })

// AFTER (writes to BOTH columns for backward compat):
.update({
  stripe_customer_id: session.customer as string,
  stripe_subscription_id: session.subscription as string,
  subscription_plan: session.metadata?.plan || "pro",
  plan: session.metadata?.plan || "pro",
  plan_status: "active",
})
```

**7b. `customer.subscription.updated` handler** — add `subscription_plan` sync:
```typescript
// Add subscription_plan to the update alongside existing plan_status/plan_period_end:
.update({
  subscription_plan: subscription.metadata?.plan || undefined,  // only set if metadata has plan
  plan: subscription.metadata?.plan || undefined,
  plan_status: mapStripeStatus(subscription.status),
  plan_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
})
```

**7c. `customer.subscription.deleted` handler** — change `"free"` to `"trial"`:
```typescript
// BEFORE: plan: "free"
// AFTER:
.update({
  subscription_plan: "trial",
  plan: "trial",
  plan_status: "canceled",
  stripe_subscription_id: null,
})
```

**7d. Add `invoice.payment_succeeded` handler** after the existing `payment_failed`:
```typescript
case "invoice.payment_succeeded": {
  const invoice = event.data.object;
  const customerId = invoice.customer as string;
  // Log to admin_activity_logs
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  if (org) {
    await admin.from("admin_activity_logs").insert({
      action: "invoice_paid",
      metadata: { invoice_id: invoice.id, amount: invoice.amount_paid, org_id: org.id },
    }).catch(() => {});
  }
  break;
}
```

**7e. Ensure `invoice.payment_failed`** writes `plan_status: "past_due"` using `subscription_plan` pattern (keep existing logic, just verify column names).

- [ ] **Step 8: Build to verify**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/api/stripe/ apps/web/src/app/api/webhooks/stripe/
git commit -m "feat(stripe): add 6 billing routes and update webhook handlers"
```

---

## Task 5: Admin Org Panel Rewrite

> **Replace 14 pages with a single 4-tab page. Core of the admin refonte.**

**Files:**
- Modify: `apps/web/src/app/[locale]/(admin)/admin/page.tsx` (complete rewrite)
- Modify: `apps/web/src/app/[locale]/(admin)/layout.tsx` (simplify sidebar)
- Create: `apps/web/src/components/admin/AdminOverviewTab.tsx`
- Create: `apps/web/src/components/admin/AdminMembersTab.tsx`
- Create: `apps/web/src/components/admin/AdminSubscriptionTab.tsx`
- Create: `apps/web/src/components/admin/AdminSettingsTab.tsx`
- Create: `apps/web/src/components/admin/TeamHealthCard.tsx`
- Create: `apps/web/src/components/admin/ActivityFeed.tsx`
- Create: `apps/web/src/components/stripe/PlanSelector.tsx`
- Create: `apps/web/src/components/stripe/InvoicesList.tsx`
- Create: `apps/web/src/app/api/admin/team-health/route.ts`
- Create: `apps/web/src/app/api/admin/activity-feed/route.ts`
- Delete: `apps/web/src/app/[locale]/(admin)/admin/members/`
- Delete: `apps/web/src/app/[locale]/(admin)/admin/finances/`
- Delete: `apps/web/src/app/[locale]/(admin)/admin/branding/`
- Delete: `apps/web/src/app/[locale]/(admin)/admin/time-savings/`

- [ ] **Step 1: Create team-health API route**

Create `apps/web/src/app/api/admin/team-health/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    // Get all members
    const { data: members } = await admin
      .from("users")
      .select("id, first_name, last_name, email, role, avatar_url")
      .eq("organization_id", profile.organization_id);

    if (!members) {
      return NextResponse.json({ members: [] });
    }

    // IMPORTANT: tasks and meetings do NOT have organization_id column.
    // Must first get org project IDs, then filter tasks by project_id.
    const { data: orgProjects } = await admin
      .from("projects")
      .select("id")
      .eq("organization_id", profile.organization_id);

    const projectIds = orgProjects?.map((p) => p.id) || [];

    // Get overdue tasks per member (scoped to org via project_id)
    const now = new Date().toISOString();
    const { data: overdueTasks } = await admin
      .from("tasks")
      .select("assigned_to, id")
      .in("project_id", projectIds)
      .not("status", "in", '("done","cancelled")')
      .lt("due_date", now);

    // Get in-progress tasks per member (scoped to org)
    const { data: inProgressTasks } = await admin
      .from("tasks")
      .select("assigned_to, id")
      .in("project_id", projectIds)
      .eq("status", "in_progress");

    // Get unprocessed emails per member (email_records HAS organization_id)
    const { data: unprocessedEmails } = await admin
      .from("email_records")
      .select("user_id, id")
      .eq("organization_id", profile.organization_id)
      .eq("is_processed", false);

    // Get last sign-in from Supabase Auth
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers();

    const memberHealth = members.map((member) => {
      const overdue = overdueTasks?.filter((t) => t.assigned_to === member.id).length || 0;
      const inProgress = inProgressTasks?.filter((t) => t.assigned_to === member.id).length || 0;
      const unread = unprocessedEmails?.filter((e) => e.user_id === member.id).length || 0;
      const authUser = authUsers?.find((u) => u.id === member.id);
      const lastSignIn = authUser?.last_sign_in_at || null;

      return {
        ...member,
        overdue_tasks: overdue,
        in_progress_tasks: inProgress,
        unprocessed_emails: unread,
        last_sign_in: lastSignIn,
      };
    });

    return NextResponse.json({ members: memberHealth });
  } catch (error) {
    console.error("[admin/team-health]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create activity-feed API route**

Create `apps/web/src/app/api/admin/activity-feed/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const orgId = profile.organization_id;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // IMPORTANT: tasks and meetings do NOT have organization_id.
    // Must first get org project IDs, then filter by project_id.
    const { data: orgProjects } = await admin
      .from("projects")
      .select("id")
      .eq("organization_id", orgId);

    const projectIds = orgProjects?.map((p) => p.id) || [];

    // Fetch activities from multiple sources in parallel
    const [emailsRes, tasksRes, meetingsRes, submissionsRes] = await Promise.all([
      // email_records HAS organization_id
      admin.from("email_records")
        .select("id, user_id, subject, received_at")
        .eq("organization_id", orgId)
        .gte("received_at", sevenDaysAgo)
        .order("received_at", { ascending: false })
        .limit(20),
      // tasks: filter via project_id (no organization_id column)
      projectIds.length > 0
        ? admin.from("tasks")
            .select("id, created_by, title, status, created_at")
            .in("project_id", projectIds)
            .gte("created_at", sevenDaysAgo)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [], error: null }),
      // meetings: filter via project_id (no organization_id column)
      projectIds.length > 0
        ? admin.from("meetings")
            .select("id, title, meeting_date, status, created_at")
            .in("project_id", projectIds)
            .gte("created_at", sevenDaysAgo)
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
      // submissions: filter via project_id (no organization_id column)
      projectIds.length > 0
        ? admin.from("submissions")
            .select("id, title, status, created_at")
            .in("project_id", projectIds)
            .gte("created_at", sevenDaysAgo)
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Get member names for display
    const { data: members } = await admin
      .from("users")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId);

    const memberMap = new Map(members?.map((m) => [m.id, `${m.first_name || ""} ${m.last_name || ""}`.trim()]) || []);

    // Merge and sort by date
    const activities: Array<{ type: string; title: string; user: string; date: string }> = [];

    emailsRes.data?.forEach((e) => activities.push({
      type: "email",
      title: e.subject || "Email",
      user: memberMap.get(e.user_id) || "Unknown",
      date: e.received_at,
    }));

    tasksRes.data?.forEach((t) => activities.push({
      type: "task",
      title: t.title,
      user: memberMap.get(t.created_by) || "Unknown",
      date: t.created_at,
    }));

    meetingsRes.data?.forEach((m) => activities.push({
      type: "meeting",
      title: m.title,
      user: "",
      date: m.meeting_date || m.created_at,
    }));

    submissionsRes.data?.forEach((s) => activities.push({
      type: "submission",
      title: s.title,
      user: "",
      date: s.created_at,
    }));

    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ activities: activities.slice(0, 50) });
  } catch (error) {
    console.error("[admin/activity-feed]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create TeamHealthCard component**

Create `apps/web/src/components/admin/TeamHealthCard.tsx` — a card per member showing:
- Avatar + name + role
- Overdue tasks count (red badge if > 0, bold red if > 3)
- In-progress tasks count
- Unprocessed emails count
- Last sign-in (gray text, "Inactive > 7j" warning if old)

- [ ] **Step 4: Create ActivityFeed component**

Create `apps/web/src/components/admin/ActivityFeed.tsx` — activity list with:
- Icon per type (Mail for email, CheckSquare for task, Video for meeting, FileText for submission)
- Title, user name, relative time
- Scrollable max-height with "no activity" empty state

- [ ] **Step 5: Create AdminOverviewTab**

Create `apps/web/src/components/admin/AdminOverviewTab.tsx`:
- Fetches `/api/admin/team-health` and `/api/admin/activity-feed` on mount
- Top: 4 KPI cards (projects, open tasks, overdue tasks, unprocessed emails)
- Middle: TeamHealthCard grid (2 columns)
- Bottom: ActivityFeed

- [ ] **Step 6: Create AdminMembersTab**

Create `apps/web/src/components/admin/AdminMembersTab.tsx`:
- Reuse logic from current `/admin/members/page.tsx`
- Table with: name, email, role, last sign-in, overdue tasks, status (active/invited)
- Actions: invite (modal), change role (dropdown), resend invite, delete member
- Header shows "X / Y utilisateurs" from plan limits
- Uses existing APIs: `GET /api/admin/clients`, `POST /api/invites`

- [ ] **Step 7: Create PlanSelector component**

Create `apps/web/src/components/stripe/PlanSelector.tsx`:
- Modal with 3 plan cards (Starter/Pro/Enterprise)
- Each card: name, price, key features, CTA button
- Current plan highlighted with "Plan actuel" badge
- CTA calls `/api/stripe/create-checkout` for new or `/api/stripe/update-subscription` for existing

- [ ] **Step 8: Create InvoicesList component**

Create `apps/web/src/components/stripe/InvoicesList.tsx`:
- Fetches `/api/stripe/invoices`
- Table: date, number, amount, status (badge), PDF link (external icon)
- Empty state if no invoices

- [ ] **Step 9: Create AdminSubscriptionTab**

Create `apps/web/src/components/admin/AdminSubscriptionTab.tsx`:
- Plan info section: current plan name, price, next billing date, last 4 digits of card
- Actions: "Changer de plan" → PlanSelector modal, "Annuler" → confirm dialog
- InvoicesList below
- "Modifier le moyen de paiement" → calls `/api/stripe/create-portal-session` and redirects

- [ ] **Step 10: Create AdminSettingsTab**

Create `apps/web/src/components/admin/AdminSettingsTab.tsx`:
- Org info form: name, address, city, country
- Branding section: logo upload (fix the broken button — read current upload-logo route), primary color picker
- Save button calls appropriate APIs

- [ ] **Step 11: Rewrite admin page.tsx with 4 tabs**

Rewrite `apps/web/src/app/[locale]/(admin)/admin/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutDashboard, Users, CreditCard, Settings } from "lucide-react";
import AdminOverviewTab from "@/components/admin/AdminOverviewTab";
import AdminMembersTab from "@/components/admin/AdminMembersTab";
import AdminSubscriptionTab from "@/components/admin/AdminSubscriptionTab";
import AdminSettingsTab from "@/components/admin/AdminSettingsTab";

const TABS = [
  { id: "overview", icon: LayoutDashboard, labelKey: "overview" },
  { id: "members", icon: Users, labelKey: "members" },
  { id: "subscription", icon: CreditCard, labelKey: "subscription" },
  { id: "settings", icon: Settings, labelKey: "settings" },
] as const;

export default function AdminPage() {
  const t = useTranslations("admin");
  // Read tab from URL params if present (e.g., ?tab=subscription)
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("tab") || "overview";
    }
    return "overview";
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h1 className="text-2xl font-bold py-6">{t("title")}</h1>
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "overview" && <AdminOverviewTab />}
        {activeTab === "members" && <AdminMembersTab />}
        {activeTab === "subscription" && <AdminSubscriptionTab />}
        {activeTab === "settings" && <AdminSettingsTab />}
      </div>
    </div>
  );
}
```

- [ ] **Step 12: Simplify admin layout sidebar**

Modify `apps/web/src/app/[locale]/(admin)/layout.tsx`:
- Remove sidebar navigation items for `/admin/members`, `/admin/finances`, `/admin/time-savings`
- Keep only the single `/admin` link (Overview) since tabs handle navigation
- Keep collapsible sidebar with back-to-app link

- [ ] **Step 13: Delete old admin sub-pages**

Delete these directories (they're now merged into tabs):
- `apps/web/src/app/[locale]/(admin)/admin/members/`
- `apps/web/src/app/[locale]/(admin)/admin/finances/`
- `apps/web/src/app/[locale]/(admin)/admin/branding/` (if exists)
- `apps/web/src/app/[locale]/(admin)/admin/time-savings/`

- [ ] **Step 14: Add i18n keys**

Add to `apps/web/messages/fr.json` under `"admin"`:

```json
{
  "admin": {
    "title": "Administration",
    "overview": "Vue d'ensemble",
    "members": "Membres",
    "subscription": "Abonnement",
    "settings": "Parametres",
    "teamHealth": "Sante de l'equipe",
    "activityFeed": "Activite recente",
    "overdueTasks": "Taches en retard",
    "inProgressTasks": "En cours",
    "unprocessedEmails": "Emails non traites",
    "lastSignIn": "Derniere connexion",
    "inactive": "Inactif",
    "inviteMember": "Inviter un membre",
    "changePlan": "Changer de plan",
    "cancelSubscription": "Annuler l'abonnement",
    "currentPlan": "Plan actuel",
    "nextBilling": "Prochaine facture",
    "invoices": "Factures",
    "paymentMethod": "Moyen de paiement",
    "modifyPayment": "Modifier",
    "usersCount": "{current} / {max} utilisateurs",
    "orgName": "Nom de l'organisation",
    "orgAddress": "Adresse",
    "branding": "Branding",
    "uploadLogo": "Telecharger le logo",
    "primaryColor": "Couleur primaire"
  }
}
```

Add equivalent keys to `en.json` and `de.json`.

- [ ] **Step 15: Build to verify**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 16: Commit**

```bash
git add apps/web/src/components/admin/ apps/web/src/components/stripe/ apps/web/src/app/api/admin/ apps/web/src/app/[locale]/(admin)/ apps/web/messages/
git commit -m "feat(admin): rewrite admin panel with 4-tab interface, team health, and Stripe subscription"
```

---

## Task 6: New Super-Admin Pages (AI Costs + Operations)

> **Two new pages + update sidebar navigation.**

**Files:**
- Create: `apps/web/src/app/[locale]/(super-admin)/super-admin/ai-costs/page.tsx`
- Create: `apps/web/src/app/[locale]/(super-admin)/super-admin/operations/page.tsx`
- Create: `apps/web/src/app/api/super-admin/impersonate/route.ts`
- Create: `apps/web/src/app/api/super-admin/force-sync/route.ts`
- Create: `apps/web/src/app/api/super-admin/force-briefing/route.ts`
- Create: `apps/web/src/components/super-admin/ImpersonationBanner.tsx`
- Modify: `apps/web/src/app/[locale]/(super-admin)/layout.tsx` (add nav items)

- [ ] **Step 1: Create AI Costs page**

Create `apps/web/src/app/[locale]/(super-admin)/super-admin/ai-costs/page.tsx`:

- Fetches `GET /api/super-admin?action=analytics&scope=platform&period={7d|30d|90d}`
- Period selector: 7j / 30j / 90j
- Top: 4 KPI cards (total cost, total calls, avg cost/call, monthly projection)
- AreaChart (recharts): daily cost + calls trend
- Table "Par organisation": org name, plan, members, calls, cost, revenue, margin %
- Table "Par utilisateur": name, email, org, calls, cost
- Table "Par fonction IA": action_type, calls, cost, % total
- BarCharts: hourly distribution, day-of-week distribution

All data comes from the existing `analytics` action on `/api/super-admin`.

- [ ] **Step 2: Create impersonate API route**

Create `apps/web/src/app/api/super-admin/impersonate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("is_superadmin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_superadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: "Missing targetUserId" }, { status: 400 });
    }

    // Get target user email
    const { data: targetUser } = await admin
      .from("users")
      .select("email")
      .eq("id", targetUserId)
      .single();

    if (!targetUser?.email) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate magic link
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetUser.email,
    });

    if (linkError || !linkData) {
      return NextResponse.json({ error: "Failed to generate link" }, { status: 500 });
    }

    // Log impersonation
    await admin.from("admin_activity_logs").insert({
      user_id: user.id,
      action: "impersonate",
      metadata: { target_user_id: targetUserId, target_email: targetUser.email },
    }).catch(() => {});

    return NextResponse.json({
      url: linkData.properties?.action_link,
    });
  } catch (error) {
    console.error("[super-admin/impersonate]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create force-sync API route**

Create `apps/web/src/app/api/super-admin/force-sync/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("is_superadmin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_superadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: "Missing targetUserId" }, { status: 400 });
    }

    // Call the sync endpoint internally
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.io";
    const syncResponse = await fetch(`${appUrl}/api/outlook/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetUserId, forceSync: true }),
    });

    const result = await syncResponse.json();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("[super-admin/force-sync]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create force-briefing API route**

Create `apps/web/src/app/api/super-admin/force-briefing/route.ts` — same pattern as force-sync but calls `/api/briefing/generate` with targetUserId.

- [ ] **Step 5: Create ImpersonationBanner component**

Create `apps/web/src/components/super-admin/ImpersonationBanner.tsx`:

```tsx
"use client";

import { AlertTriangle } from "lucide-react";

interface ImpersonationBannerProps {
  userName: string;
  returnUrl: string;
}

export function ImpersonationBanner({ userName, returnUrl }: ImpersonationBannerProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>Vous etes connecte en tant que <strong>{userName}</strong></span>
      </div>
      <a href={returnUrl} className="underline hover:no-underline font-medium">
        Retour super-admin
      </a>
    </div>
  );
}
```

- [ ] **Step 6: Create Operations page**

Create `apps/web/src/app/[locale]/(super-admin)/super-admin/operations/page.tsx`:

Sections:
1. **Force Actions** — Cards for: Force Sync (select user dropdown + button), Force Briefing (select user + button), Run CRONs (4 buttons: briefing, sync, benchmarks, patterns)
2. **Impersonation** — Select user dropdown + "Se connecter en tant que" button → opens magic link in new tab
3. **Diagnostics** — Links to: Sentry errors, Debug org, Merge orgs, Invalidate cache

Each action button:
- Shows loading spinner while executing
- Shows toast on success/failure
- CRON buttons call `POST /api/cron/{name}` with `CRON_SECRET` header

- [ ] **Step 7: Update super-admin layout sidebar**

Modify `apps/web/src/app/[locale]/(super-admin)/layout.tsx`:

Add 2 new nav items after the existing ones:

```typescript
{ href: "/super-admin/ai-costs", icon: DollarSign, label: "Couts IA" },
{ href: "/super-admin/operations", icon: Wrench, label: "Operations" },
```

Import `DollarSign` and `Wrench` from `lucide-react`.

- [ ] **Step 8: Build to verify**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/[locale]/(super-admin)/ apps/web/src/app/api/super-admin/ apps/web/src/components/super-admin/
git commit -m "feat(super-admin): add AI costs page, operations page, and impersonation"
```

---

## Task 7: Super-Admin Page Enhancements

> **Improve existing super-admin pages with real data.**

**Files:**
- Modify: `apps/web/src/app/[locale]/(super-admin)/super-admin/page.tsx`
- Modify: `apps/web/src/app/[locale]/(super-admin)/super-admin/organizations/page.tsx`
- Modify: `apps/web/src/app/[locale]/(super-admin)/super-admin/users/page.tsx`
- Modify: `apps/web/src/app/[locale]/(super-admin)/super-admin/billing/page.tsx`
- Modify: `apps/web/src/app/[locale]/(super-admin)/super-admin/config/page.tsx`

- [ ] **Step 1: Enhance super-admin dashboard**

Read `apps/web/src/app/[locale]/(super-admin)/super-admin/page.tsx`.

Add alerts section below existing content:
- Payment failed alerts (orgs with `plan_status = 'past_due'`)
- Trial expiring alerts (orgs with `trial_ends_at` within 3 days)
- Inactive users (no sign-in > 30 days)

Fetch from `/api/super-admin?action=list-organizations` and compute alerts client-side.

- [ ] **Step 2: Add AI cost columns to organizations page**

Read `apps/web/src/app/[locale]/(super-admin)/super-admin/organizations/page.tsx`.

Add columns: Appels IA, Cout IA, Marge. Data comes from the `analytics` action (already fetched per session 2026-03-15). Ensure the analytics fetch uses the correct period.

- [ ] **Step 3: Add impersonate action to users page**

Read `apps/web/src/app/[locale]/(super-admin)/super-admin/users/page.tsx`.

Add "Impersonate" button per user row. On click: `POST /api/super-admin/impersonate` → open returned URL in `window.open()`.

- [ ] **Step 4: Fix billing page MRR/ARR**

Read `apps/web/src/app/[locale]/(super-admin)/super-admin/billing/page.tsx`.

Ensure MRR is computed from `subscription_plan` (not `plan`). Use the new pricing: trial=0, starter=149, pro=349, enterprise=790.

- [ ] **Step 5: Add plan limits editor to config page**

Read `apps/web/src/app/[locale]/(super-admin)/super-admin/config/page.tsx`.

Add a section showing `PLAN_FEATURES` in a read-only table (the limits are in code, not DB-editable for now). Display: plan name, AI calls limit, max users, max projects, features enabled.

- [ ] **Step 6: Build to verify**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/[locale]/(super-admin)/
git commit -m "feat(super-admin): enhance dashboard alerts, org/user AI costs, billing MRR"
```

---

## Task 8: Trial Expiration Flow + Usage Limit Banner

> **Enforce trial expiration and show usage limit warnings.**

**Files:**
- Create: `apps/web/src/components/stripe/UsageLimitBanner.tsx`
- Modify: `apps/web/src/middleware.ts` (trial expiration redirect)
- Modify: `apps/web/src/app/[locale]/(app)/layout.tsx` (mount banner)

- [ ] **Step 1: Create UsageLimitBanner**

Create `apps/web/src/components/stripe/UsageLimitBanner.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface UsageLimitBannerProps {
  orgId: string;
  plan: string;
}

export function UsageLimitBanner({ orgId, plan }: UsageLimitBannerProps) {
  const [usage, setUsage] = useState<{ current: number; limit: number } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/usage-stats?orgId=${orgId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.current && data.limit) {
          setUsage({ current: data.current, limit: data.limit });
        }
      })
      .catch(() => {});
  }, [orgId]);

  if (!usage || dismissed) return null;

  const pct = (usage.current / usage.limit) * 100;
  if (pct < 80) return null;

  const isBlocked = pct >= 100;

  return (
    <div className={`px-4 py-3 flex items-center justify-between text-sm ${
      isBlocked ? "bg-red-50 text-red-800 border-b border-red-200" : "bg-amber-50 text-amber-800 border-b border-amber-200"
    }`}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        {isBlocked ? (
          <span>Limite IA atteinte ({usage.current}/{usage.limit} appels). <a href="/admin?tab=subscription" className="underline">Upgradez votre plan</a></span>
        ) : (
          <span>{Math.round(pct)}% de votre quota IA utilise ({usage.current}/{usage.limit})</span>
        )}
      </div>
      {!isBlocked && (
        <button onClick={() => setDismissed(true)}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add trial expiration check in app layout (NOT middleware)**

**Do NOT add a DB query to middleware** — it runs on every request and would add latency.

Instead, add the trial check in `apps/web/src/app/[locale]/(app)/layout.tsx` (server component). This runs once per page load, not per API call.

In the layout's server-side logic (already fetches user + org via AuthProvider):

```typescript
// In the (app) layout, after fetching org data:
// Check if trial has expired
const isTrialExpired = org?.subscription_plan === "trial"
  && org?.trial_ends_at
  && new Date(org.trial_ends_at) < new Date();

// If expired, show blocking overlay instead of redirecting
// (redirect in layout causes hydration issues)
```

Then in the JSX, conditionally render a full-screen blocking overlay:

```tsx
{isTrialExpired && (
  <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
    <div className="max-w-2xl text-center p-8">
      <h1 className="text-2xl font-bold mb-4">Votre essai est termine</h1>
      <p className="text-gray-600 mb-8">Choisissez un plan pour continuer a utiliser Cantaia.</p>
      <PlanSelector onSelect={(plan) => { /* redirect to checkout */ }} />
    </div>
  </div>
)}
```

This avoids: middleware DB queries, redirect loops, and the need for a separate `/trial-expired` page.

- [ ] **Step 3: Mount UsageLimitBanner in app layout**

In `apps/web/src/app/[locale]/(app)/layout.tsx`, add `<UsageLimitBanner>` at the top of the content area, passing orgId and plan from the auth context.

- [ ] **Step 4: Build to verify**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/stripe/ apps/web/src/app/[locale]/(app)/layout.tsx
git commit -m "feat: add usage limit banner and trial expiration overlay"
```

---

## Task 9: Add checkUsageLimit to AI Routes

> **Enforce IA limits on all 17+ AI routes.**

**Files:**
- Modify: All routes listed in spec Section 4.2

- [ ] **Step 1: List all AI routes to modify**

These routes need `checkUsageLimit()` added at the top:
- `apps/web/src/app/api/ai/classify-email/route.ts`
- `apps/web/src/app/api/ai/extract-tasks/route.ts`
- `apps/web/src/app/api/ai/generate-reply/route.ts`
- `apps/web/src/app/api/ai/generate-pv/route.ts`
- `apps/web/src/app/api/ai/generate-briefing/route.ts`
- `apps/web/src/app/api/ai/analyze-plan/route.ts`
- `apps/web/src/app/api/plans/estimate-v2/route.ts`
- `apps/web/src/app/api/chat/route.ts`
- `apps/web/src/app/api/submissions/[id]/analyze/route.ts`
- `apps/web/src/app/api/submissions/[id]/estimate-budget/route.ts`
- `apps/web/src/app/api/visits/generate-report/route.ts`
- `apps/web/src/app/api/visits/analyze-notes/route.ts`
- `apps/web/src/app/api/planning/generate/route.ts` (if exists)

**Do NOT add to**: `/api/outlook/sync` (cron/system call), `/api/cron/*` (system)

- [ ] **Step 2: Add the check pattern to each route**

For each route, add after auth check and before the AI call:

```typescript
import { checkUsageLimit } from "@cantaia/config/plan-features";

// After getting user profile with organization_id and subscription_plan:
const usageCheck = await checkUsageLimit(admin, profile.organization_id, org.subscription_plan || "trial");
if (!usageCheck.allowed) {
  return NextResponse.json(
    { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
    { status: 429 }
  );
}
```

Each route already has auth + profile fetch. Add the usage check right after that, before any AI API call.

- [ ] **Step 3: Process routes in batches of 3-4**

Process the routes in batches. For each batch:
1. Read the file
2. Find the location after auth check
3. Add the import + check
4. Verify no TypeScript errors

Batch 1: `classify-email`, `extract-tasks`, `generate-reply`, `generate-pv`
Batch 2: `generate-briefing`, `analyze-plan`, `estimate-v2`, `chat`
Batch 3: `analyze` (submissions), `estimate-budget`, `generate-report`, `analyze-notes`

- [ ] **Step 4: Build to verify**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/ai/ apps/web/src/app/api/plans/ apps/web/src/app/api/chat/ apps/web/src/app/api/submissions/ apps/web/src/app/api/visits/ apps/web/src/app/api/planning/
git commit -m "feat: enforce AI usage limits on all 17+ AI routes"
```

---

## Task 10: Update CLAUDE.md & Final Cleanup

> **Update project documentation with all changes.**

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update domain references in CLAUDE.md**

Replace all `cantaia.ch` with `cantaia.io`, all `cantaia.com` with removed, all `cantaia.app` with removed.

Update:
- Section 1 (Domaines): `cantaia.io (principal)`
- Section 4 (BASE_DOMAIN): `cantaia.io`
- Section 4 (PWA Manifest): `cantaia.io`
- Section 4 (Subdomaines): `*.cantaia.io`
- Section 6 (new API routes): Add all Stripe routes + admin routes + super-admin routes
- Section 7 (Pages): Update admin section (14 pages → 1 page 4 onglets), add AI Costs + Operations pages
- Section 13 (Etat actuel): Update page count, route count, migration count (054)
- Add new Section: Plan tarifaires (Trial/Starter/Pro/Enterprise with pricing)

- [ ] **Step 2: Verify the full build passes**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: 0 errors (or only pre-existing errors from other specs).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with admin refonte, Stripe, and cantaia.io migration"
```

---

## Summary: Commit Sequence

| # | Task | Commit Message |
|---|------|---------------|
| 1 | Fix api_usage_logs | `fix(tracking): add error logging to trackApiUsage and verify call sites` |
| 2 | Domain migration | `chore: migrate all domain references from cantaia.ch to cantaia.io` |
| 3 | Plan features | `feat: add plan features config, usage limits, and migration 054` |
| 4 | Stripe routes | `feat(stripe): add 6 billing routes and update webhook handlers` |
| 5 | Admin org rewrite | `feat(admin): rewrite admin panel with 4-tab interface, team health, and Stripe subscription` |
| 6 | Super-admin new pages | `feat(super-admin): add AI costs page, operations page, and impersonation` |
| 7 | Super-admin enhancements | `feat(super-admin): enhance dashboard alerts, org/user AI costs, billing MRR` |
| 8 | Trial + usage banner | `feat: add usage limit banner and trial expiration redirect` |
| 9 | Usage limits on AI routes | `feat: enforce AI usage limits on all 17+ AI routes` |
| 10 | CLAUDE.md | `docs: update CLAUDE.md with admin refonte, Stripe, and cantaia.io migration` |

## Manual Steps for Julien (Post-Implementation)

1. Apply migration 054 on Supabase
2. Create Stripe products/prices matching `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`, `STRIPE_PRICE_PRO_EXTRA_USER`
3. Set Stripe env vars on Vercel: `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`, `STRIPE_PRICE_PRO_EXTRA_USER`
4. Configure DNS: cantaia.io → Vercel
5. Add cantaia.io as custom domain on Vercel
6. Update Azure AD redirect_uri to `https://cantaia.io/api/auth/microsoft-connect`
7. Update Supabase redirect URLs
8. Update Stripe webhook URL to `https://cantaia.io/api/webhooks/stripe`
9. Verify cantaia.io in Google Search Console
10. Check that `api_usage_logs` table exists in production (migration 004)
