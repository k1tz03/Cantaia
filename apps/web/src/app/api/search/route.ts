import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { MIN_QUERY_LENGTH, type SearchResult, type SearchResultType } from "./types";
import { compareResults, sanitizeTerm, scoreMatch } from "./ranking";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=<term>&limit=<per-type limit>
 *
 * Federated search across the entities a user can reach from the command
 * palette. Every source is queried in parallel with a case-insensitive
 * `ilike` — no full-text index is required, which keeps this working on every
 * environment regardless of which migrations have been applied.
 *
 * Scoping rules (STRICT — do not relax):
 *   - projects / submissions / suppliers / plan_registry → `organization_id`
 *   - tasks / meetings                                   → parent project org
 *                                                          (`projects!inner`)
 *   - email_records                                      → `user_id`
 *     Emails are personal mailbox data, never org-wide.
 *
 * `href` values are locale-less app paths; the caller prefixes `/{locale}`.
 */

const DEFAULT_PER_TYPE_LIMIT = 5;
const MAX_PER_TYPE_LIMIT = 20;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") ?? "";
  const term = sanitizeTerm(rawQuery);
  const perType = Math.min(
    Math.max(parseInt(searchParams.get("limit") || String(DEFAULT_PER_TYPE_LIMIT), 10) || DEFAULT_PER_TYPE_LIMIT, 1),
    MAX_PER_TYPE_LIMIT
  );

  // Below the minimum length we answer without touching the database at all.
  if (term.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ query: term, results: [], total: 0, failed: [] });
  }

  const admin = createAdminClient();

  // The limiter is generous: the client debounces, so a normal session sends a
  // handful of requests per minute. It exists to cap scripted abuse only.
  const [limit, profileResult] = await Promise.all([
    rateLimit(`search:user:${user.id}`, { limit: 120, windowSec: 60 }),
    admin.from("users").select("organization_id").eq("id", user.id).maybeSingle(),
  ]);

  if (!limit.allowed) {
    return rateLimitResponse(limit);
  }

  const orgId = profileResult.data?.organization_id ?? null;
  const pattern = `%${term}%`;
  const failed: SearchResultType[] = [];

  /** Run one source; never let a single failure take down the whole search. */
  async function source<T>(
    type: SearchResultType,
    run: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
  ): Promise<T[]> {
    try {
      const { data, error } = await run();
      if (error) {
        console.warn(`[search] ${type} failed: ${error.message}`);
        failed.push(type);
        return [];
      }
      return data ?? [];
    } catch (err) {
      console.warn(`[search] ${type} threw:`, err);
      failed.push(type);
      return [];
    }
  }

  const orgScoped = <T>(
    type: SearchResultType,
    run: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
  ): Promise<T[]> => (orgId ? source(type, run) : Promise.resolve([] as T[]));

  const [projects, emails, tasks, submissions, suppliers, plans, meetings] = await Promise.all([
    orgScoped<any>("project", () =>
      (admin as any)
        .from("projects")
        .select("id, name, code, client_name, city, status")
        .eq("organization_id", orgId)
        .or(`name.ilike.${pattern},code.ilike.${pattern},client_name.ilike.${pattern}`)
        .limit(perType)
    ),

    // Emails are user-scoped: a mailbox is personal, never shared org-wide.
    source<any>("email", () =>
      (admin as any)
        .from("email_records")
        .select("id, subject, sender_name, sender_email, received_at, project_id")
        .eq("user_id", user.id)
        .ilike("subject", pattern)
        .order("received_at", { ascending: false })
        .limit(perType)
    ),

    orgScoped<any>("task", () =>
      (admin as any)
        .from("tasks")
        .select("id, title, status, due_date, project_id, projects!inner(id, name, organization_id)")
        .eq("projects.organization_id", orgId)
        .ilike("title", pattern)
        .limit(perType)
    ),

    orgScoped<any>("submission", () =>
      (admin as any)
        .from("submissions")
        .select("id, title, reference, status, project_id")
        .eq("organization_id", orgId)
        .or(`title.ilike.${pattern},reference.ilike.${pattern}`)
        .limit(perType)
    ),

    orgScoped<any>("supplier", () =>
      (admin as any)
        .from("suppliers")
        .select("id, company_name, city, contact_name")
        .eq("organization_id", orgId)
        .ilike("company_name", pattern)
        .limit(perType)
    ),

    orgScoped<any>("plan", () =>
      (admin as any)
        .from("plan_registry")
        .select("id, plan_number, plan_title, discipline, project_id")
        .eq("organization_id", orgId)
        .or(`plan_number.ilike.${pattern},plan_title.ilike.${pattern}`)
        .limit(perType)
    ),

    orgScoped<any>("meeting", () =>
      (admin as any)
        .from("meetings")
        .select("id, title, meeting_date, meeting_number, project_id, projects!inner(id, name, organization_id)")
        .eq("projects.organization_id", orgId)
        .ilike("title", pattern)
        .order("meeting_date", { ascending: false })
        .limit(perType)
    ),
  ]);

  const scored: Array<SearchResult & { score: number }> = [];

  for (const p of projects) {
    scored.push({
      id: p.id,
      type: "project",
      title: p.name,
      subtitle: [p.code, p.client_name || p.city].filter(Boolean).join(" · ") || null,
      href: `/projects/${p.id}`,
      projectId: p.id,
      score: scoreMatch(term, p.name, p.code, p.client_name),
    });
  }

  for (const e of emails) {
    scored.push({
      id: e.id,
      type: "email",
      // Left raw (possibly empty): the client owns the localized fallback.
      title: e.subject ?? "",
      subtitle: e.sender_name || e.sender_email || null,
      href: `/mail?emailId=${encodeURIComponent(e.id)}`,
      projectId: e.project_id ?? null,
      score: scoreMatch(term, e.subject),
    });
  }

  for (const t of tasks) {
    scored.push({
      id: t.id,
      type: "task",
      title: t.title,
      subtitle: t.projects?.name ?? null,
      href: `/tasks?taskId=${encodeURIComponent(t.id)}`,
      projectId: t.project_id ?? null,
      score: scoreMatch(term, t.title),
    });
  }

  for (const s of submissions) {
    scored.push({
      id: s.id,
      type: "submission",
      title: s.title,
      subtitle: s.reference || null,
      href: `/submissions/${s.id}`,
      projectId: s.project_id ?? null,
      score: scoreMatch(term, s.title, s.reference),
    });
  }

  for (const s of suppliers) {
    scored.push({
      id: s.id,
      type: "supplier",
      title: s.company_name,
      subtitle: [s.contact_name, s.city].filter(Boolean).join(" · ") || null,
      href: `/suppliers?supplierId=${encodeURIComponent(s.id)}`,
      score: scoreMatch(term, s.company_name),
    });
  }

  for (const p of plans) {
    scored.push({
      id: p.id,
      type: "plan",
      title: p.plan_title || p.plan_number,
      subtitle: [p.plan_number, p.discipline].filter(Boolean).join(" · ") || null,
      href: `/plans/${p.id}`,
      projectId: p.project_id ?? null,
      score: scoreMatch(term, p.plan_title, p.plan_number),
    });
  }

  for (const m of meetings) {
    scored.push({
      id: m.id,
      type: "meeting",
      title: m.title,
      subtitle: m.projects?.name ?? null,
      href: `/pv-chantier/${m.id}`,
      projectId: m.project_id ?? null,
      score: scoreMatch(term, m.title),
    });
  }

  scored.sort(compareResults);

  // `score` is an internal ranking aid; it stays out of the public payload.
  const results: SearchResult[] = scored.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    subtitle: r.subtitle,
    href: r.href,
    projectId: r.projectId ?? null,
  }));

  return NextResponse.json({
    query: term,
    results,
    total: results.length,
    failed,
  });
}
