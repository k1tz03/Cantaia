// ============================================================
// Cantaia — Chat data tools (READ-ONLY, org-scoped)
// ============================================================
// Five read-only tools exposed to the chat assistant so it can answer
// questions about the user's actual data instead of guessing.
//
// Hard rules for everything in this file:
//   1. READ ONLY. No insert/update/delete, ever.
//   2. Every query is scoped to the caller's organization_id. The admin
//      client bypasses RLS, so scoping is our responsibility here.
//   3. Free-text is sanitised before being interpolated into PostgREST
//      `.or()` filters (see SEC2.FIX6/FIX7 in CLAUDE.md).
//   4. Results are bounded — the model does not need 500 rows.
//
// Deliberately standalone: this does NOT import the agent tool-handlers
// (owned by another workstream) so the two can evolve independently.

type AdminClient = { from: (table: string) => any };

export interface ChatToolContext {
  admin: AdminClient;
  organizationId: string;
  userId: string;
  /** Project the chat is currently scoped to, if any. Used as default. */
  defaultProjectId?: string | null;
}

/** Max rows returned by any single tool call. */
const ROW_LIMIT = 25;

/**
 * Strip characters that carry meaning inside a PostgREST `.or()` filter.
 * `%` and `_` are LIKE wildcards; `,` `(` `)` `.` are filter syntax.
 */
function sanitizeForFilter(value: string): string {
  return value.replace(/[%_,().*:]/g, " ").trim().slice(0, 80);
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Tool definitions (Anthropic Messages API `tools` shape) ────────

export const CHAT_TOOLS = [
  {
    name: "get_project_overview",
    description:
      "Récupère la fiche d'un projet de l'organisation : statut, client, dates, budget, " +
      "plus les compteurs de tâches (ouvertes / en retard), de soumissions et de rapports de chantier. " +
      "Sans project_id, retourne la liste des projets actifs avec leurs compteurs. " +
      "Utilise cet outil dès que l'utilisateur demande « où en est le projet X », un état d'avancement, ou un point de situation.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description:
            "UUID du projet. Omettre pour obtenir la vue d'ensemble de tous les projets actifs.",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "list_overdue_tasks",
    description:
      "Liste les tâches en retard (échéance dépassée, statut non terminé/annulé) de l'organisation, " +
      "triées de la plus ancienne à la plus récente. Filtrable par projet. " +
      "Utilise cet outil pour « qu'est-ce qui est en retard », « mes urgences », « ce qui traîne ».",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "UUID du projet pour restreindre la liste. Optionnel.",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_submission_status",
    description:
      "Recherche une soumission par son titre ou sa référence et retourne son avancement : " +
      "statut, deadline, nombre de demandes de prix envoyées, nombre de réponses reçues, " +
      "et la liste des fournisseurs qui n'ont pas encore répondu. " +
      "Utilise cet outil pour « où en est la soumission X », « qui n'a pas répondu », « combien d'offres reçues ».",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Titre, extrait de titre ou référence de la soumission recherchée.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_data",
    description:
      "Recherche transversale dans les données de l'organisation : projets, tâches, soumissions, " +
      "fournisseurs et emails classés. Retourne les correspondances groupées par type. " +
      "Utilise cet outil quand l'utilisateur mentionne un nom, une référence ou un mot-clé " +
      "sans préciser où chercher (« as-tu quelque chose sur Menétrey ? »).",
    input_schema: {
      type: "object" as const,
      properties: {
        q: {
          type: "string",
          description: "Terme recherché (minimum 2 caractères).",
        },
      },
      required: ["q"],
    },
  },
  {
    name: "get_recent_activity",
    description:
      "Retourne l'activité récente d'un projet : derniers emails classés, derniers rapports de chantier " +
      "et derniers procès-verbaux. Utilise cet outil pour « quoi de neuf sur X », « résume-moi la semaine ».",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description:
            "UUID du projet. Omettre pour utiliser le projet actif de la conversation.",
        },
      },
      required: [] as string[],
    },
  },
] as const;

/** Names the model is allowed to call — used to reject anything unexpected. */
const TOOL_NAMES = new Set<string>(CHAT_TOOLS.map((t) => t.name));

// ── Shared helpers ────────────────────────────────────────────────

const OPEN_TASK_STATUSES = ["todo", "in_progress", "waiting"];
const ACTIVE_SUBMISSION_STATUSES = ["sent", "responses", "comparing"];

/**
 * Resolve the set of project ids belonging to the caller's org.
 * Every project-scoped query funnels through this so a caller can never
 * reach another organisation's rows by passing a foreign project_id.
 */
async function orgProjectIds(ctx: ChatToolContext): Promise<string[]> {
  const { data } = await ctx.admin
    .from("projects")
    .select("id")
    .eq("organization_id", ctx.organizationId);
  return (data || []).map((p: { id: string }) => p.id);
}

/** Returns the project only if it belongs to the caller's org, else null. */
async function getOwnedProject(ctx: ChatToolContext, projectId: string) {
  const { data } = await ctx.admin
    .from("projects")
    .select(
      "id, name, code, status, client_name, city, start_date, end_date, budget_total"
    )
    .eq("id", projectId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  return data || null;
}

// ── Tool implementations ──────────────────────────────────────────

async function getProjectOverview(ctx: ChatToolContext, projectId?: string) {
  const target = projectId || ctx.defaultProjectId || null;

  if (target) {
    const project = await getOwnedProject(ctx, target);
    if (!project) {
      return { found: false, reason: "Projet introuvable dans cette organisation." };
    }

    const [tasksRes, submissionsRes, reportsRes] = await Promise.all([
      ctx.admin
        .from("tasks")
        .select("id, status, due_date")
        .eq("project_id", project.id),
      ctx.admin
        .from("submissions")
        .select("id, title, status, deadline")
        .eq("project_id", project.id)
        .order("deadline", { ascending: true })
        .limit(ROW_LIMIT),
      ctx.admin
        .from("site_reports")
        .select("id, report_date, status")
        .eq("project_id", project.id)
        .order("report_date", { ascending: false })
        .limit(ROW_LIMIT),
    ]);

    const tasks = tasksRes.data || [];
    const day = today();
    const open = tasks.filter((t: any) => OPEN_TASK_STATUSES.includes(t.status));
    const overdue = open.filter((t: any) => t.due_date && t.due_date < day);
    const submissions = submissionsRes.data || [];

    return {
      found: true,
      project: {
        id: project.id,
        name: project.name,
        code: project.code,
        status: project.status,
        client_name: project.client_name,
        city: project.city,
        start_date: project.start_date,
        end_date: project.end_date,
        budget_total: project.budget_total,
      },
      counts: {
        tasks_open: open.length,
        tasks_overdue: overdue.length,
        submissions_total: submissions.length,
        submissions_active: submissions.filter((s: any) =>
          ACTIVE_SUBMISSION_STATUSES.includes(s.status)
        ).length,
        site_reports: (reportsRes.data || []).length,
      },
      submissions: submissions.map((s: any) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        deadline: s.deadline,
      })),
      last_site_report: (reportsRes.data || [])[0] || null,
    };
  }

  // No specific project — overview of every active project in the org.
  const { data: projects } = await ctx.admin
    .from("projects")
    .select("id, name, code, status, client_name, city")
    .eq("organization_id", ctx.organizationId)
    .in("status", ["active", "planning"])
    .limit(ROW_LIMIT);

  const ids = (projects || []).map((p: any) => p.id);
  if (ids.length === 0) return { projects: [], note: "Aucun projet actif." };

  const { data: tasks } = await ctx.admin
    .from("tasks")
    .select("project_id, status, due_date")
    .in("project_id", ids);

  const day = today();
  const byProject = new Map<string, { open: number; overdue: number }>();
  for (const t of tasks || []) {
    if (!OPEN_TASK_STATUSES.includes(t.status)) continue;
    const entry = byProject.get(t.project_id) || { open: 0, overdue: 0 };
    entry.open += 1;
    if (t.due_date && t.due_date < day) entry.overdue += 1;
    byProject.set(t.project_id, entry);
  }

  return {
    projects: (projects || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      status: p.status,
      client_name: p.client_name,
      city: p.city,
      tasks_open: byProject.get(p.id)?.open ?? 0,
      tasks_overdue: byProject.get(p.id)?.overdue ?? 0,
    })),
  };
}

async function listOverdueTasks(ctx: ChatToolContext, projectId?: string) {
  const target = projectId || ctx.defaultProjectId || null;

  let ids: string[];
  if (target) {
    const project = await getOwnedProject(ctx, target);
    if (!project) {
      return { found: false, reason: "Projet introuvable dans cette organisation." };
    }
    ids = [project.id];
  } else {
    ids = await orgProjectIds(ctx);
  }

  if (ids.length === 0) return { tasks: [], count: 0 };

  const day = today();
  const { data: tasks } = await ctx.admin
    .from("tasks")
    .select(
      "id, project_id, title, status, priority, due_date, assigned_to_name, lot_code"
    )
    .in("project_id", ids)
    .in("status", OPEN_TASK_STATUSES)
    .not("due_date", "is", null)
    .lt("due_date", day)
    .order("due_date", { ascending: true })
    .limit(ROW_LIMIT);

  const { data: projects } = await ctx.admin
    .from("projects")
    .select("id, name")
    .in("id", ids);
  const nameById = new Map<string, string>(
    (projects || []).map((p: any) => [p.id, p.name])
  );

  return {
    count: (tasks || []).length,
    tasks: (tasks || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      project_name: nameById.get(t.project_id) ?? null,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      days_overdue: Math.max(
        0,
        Math.round(
          (new Date(day).getTime() - new Date(t.due_date).getTime()) / 86400000
        )
      ),
      assigned_to: t.assigned_to_name,
      lot_code: t.lot_code,
    })),
  };
}

async function getSubmissionStatus(ctx: ChatToolContext, rawQuery: string) {
  const q = sanitizeForFilter(String(rawQuery || ""));
  if (q.length < 2) {
    return { found: false, reason: "Terme de recherche trop court." };
  }

  const { data: matches } = await ctx.admin
    .from("submissions")
    .select("id, title, reference, status, deadline, project_id, created_at")
    .eq("organization_id", ctx.organizationId)
    .or(`title.ilike.%${q}%,reference.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!matches || matches.length === 0) {
    return { found: false, reason: `Aucune soumission ne correspond à « ${q} ».` };
  }

  const submission = matches[0];

  // Price requests live in two generations of schema depending on which
  // migrations an org has applied — try the newer table, fall back.
  let requests: any[] = [];
  for (const table of ["submission_price_requests", "price_requests"]) {
    const { data, error } = await ctx.admin
      .from(table)
      .select("id, supplier_id, status, sent_at, responded_at")
      .eq("submission_id", submission.id)
      .limit(100);
    if (!error && data) {
      requests = data;
      break;
    }
  }

  const supplierIds = Array.from(
    new Set(requests.map((r) => r.supplier_id).filter(Boolean))
  );
  let supplierNames = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: suppliers } = await ctx.admin
      .from("suppliers")
      .select("id, company_name")
      .in("id", supplierIds);
    supplierNames = new Map(
      (suppliers || []).map((s: any) => [s.id, s.company_name])
    );
  }

  const responded = requests.filter(
    (r) => r.responded_at || r.status === "responded" || r.status === "received"
  );
  const pending = requests.filter((r) => !responded.includes(r));

  const project = submission.project_id
    ? await getOwnedProject(ctx, submission.project_id)
    : null;

  const deadline = submission.deadline;
  const daysRemaining = deadline
    ? Math.ceil(
        (new Date(deadline).getTime() - new Date(today()).getTime()) / 86400000
      )
    : null;

  return {
    found: true,
    submission: {
      id: submission.id,
      title: submission.title,
      reference: submission.reference,
      status: submission.status,
      deadline,
      days_remaining: daysRemaining,
      project_name: project?.name ?? null,
    },
    price_requests: {
      sent: requests.length,
      responded: responded.length,
      pending: pending.length,
      awaiting_response: pending
        .slice(0, ROW_LIMIT)
        .map((r) => supplierNames.get(r.supplier_id) || "Fournisseur inconnu"),
    },
    other_matches: matches.slice(1).map((m: any) => ({
      id: m.id,
      title: m.title,
      status: m.status,
    })),
  };
}

async function searchData(ctx: ChatToolContext, rawQuery: string) {
  const q = sanitizeForFilter(String(rawQuery || ""));
  if (q.length < 2) {
    return { results: {}, note: "Terme de recherche trop court (2 caractères minimum)." };
  }

  const ids = await orgProjectIds(ctx);
  const scoped = ids.length > 0 ? ids : ["__none__"];

  const [projectsRes, tasksRes, submissionsRes, suppliersRes, emailsRes] =
    await Promise.all([
      ctx.admin
        .from("projects")
        .select("id, name, code, status, client_name, city")
        .eq("organization_id", ctx.organizationId)
        .or(`name.ilike.%${q}%,code.ilike.%${q}%,client_name.ilike.%${q}%`)
        .limit(10),
      ctx.admin
        .from("tasks")
        .select("id, project_id, title, status, priority, due_date")
        .in("project_id", scoped)
        .ilike("title", `%${q}%`)
        .limit(10),
      ctx.admin
        .from("submissions")
        .select("id, title, reference, status, deadline")
        .eq("organization_id", ctx.organizationId)
        .or(`title.ilike.%${q}%,reference.ilike.%${q}%`)
        .limit(10),
      ctx.admin
        .from("suppliers")
        .select("id, company_name, contact_name, email, overall_score")
        .eq("organization_id", ctx.organizationId)
        .or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%`)
        .limit(10),
      ctx.admin
        .from("email_records")
        .select("id, subject, sender_name, sender_email, received_at, classification")
        .eq("user_id", ctx.userId)
        .or(`subject.ilike.%${q}%,sender_name.ilike.%${q}%,sender_email.ilike.%${q}%`)
        .order("received_at", { ascending: false })
        .limit(10),
    ]);

  const total =
    (projectsRes.data?.length || 0) +
    (tasksRes.data?.length || 0) +
    (submissionsRes.data?.length || 0) +
    (suppliersRes.data?.length || 0) +
    (emailsRes.data?.length || 0);

  return {
    query: q,
    total,
    results: {
      projects: projectsRes.data || [],
      tasks: tasksRes.data || [],
      submissions: submissionsRes.data || [],
      suppliers: suppliersRes.data || [],
      emails: (emailsRes.data || []).map((e: any) => ({
        id: e.id,
        subject: e.subject,
        from: e.sender_name || e.sender_email,
        received_at: e.received_at,
        classification: e.classification,
      })),
    },
  };
}

async function getRecentActivity(ctx: ChatToolContext, projectId?: string) {
  const target = projectId || ctx.defaultProjectId || null;
  if (!target) {
    return {
      found: false,
      reason:
        "Aucun projet précisé. Demande à l'utilisateur de sélectionner un projet, ou appelle get_project_overview pour lister les projets.",
    };
  }

  const project = await getOwnedProject(ctx, target);
  if (!project) {
    return { found: false, reason: "Projet introuvable dans cette organisation." };
  }

  const [emailsRes, reportsRes, meetingsRes] = await Promise.all([
    ctx.admin
      .from("email_records")
      .select(
        "id, subject, sender_name, sender_email, received_at, classification, ai_summary"
      )
      .eq("project_id", project.id)
      .order("received_at", { ascending: false })
      .limit(10),
    ctx.admin
      .from("site_reports")
      .select("id, report_date, status, submitted_by_name, weather, remarks")
      .eq("project_id", project.id)
      .order("report_date", { ascending: false })
      .limit(5),
    ctx.admin
      .from("meetings")
      .select("id, title, meeting_date, status, location")
      .eq("project_id", project.id)
      .order("meeting_date", { ascending: false })
      .limit(5),
  ]);

  return {
    found: true,
    project: { id: project.id, name: project.name, code: project.code },
    recent_emails: (emailsRes.data || []).map((e: any) => ({
      subject: e.subject,
      from: e.sender_name || e.sender_email,
      received_at: e.received_at,
      classification: e.classification,
      summary: e.ai_summary,
    })),
    recent_site_reports: reportsRes.data || [],
    recent_meetings: meetingsRes.data || [],
  };
}

// ── Dispatcher ────────────────────────────────────────────────────

/**
 * Execute one tool call. Always resolves — failures come back as a
 * structured `{ error }` payload so the model can recover rather than
 * the whole conversation blowing up on a bad table name.
 */
export async function executeChatTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ChatToolContext
): Promise<unknown> {
  if (!TOOL_NAMES.has(name)) {
    return { error: `Outil inconnu : ${name}` };
  }

  try {
    switch (name) {
      case "get_project_overview":
        return await getProjectOverview(ctx, input.project_id as string | undefined);
      case "list_overdue_tasks":
        return await listOverdueTasks(ctx, input.project_id as string | undefined);
      case "get_submission_status":
        return await getSubmissionStatus(ctx, input.query as string);
      case "search_data":
        return await searchData(ctx, input.q as string);
      case "get_recent_activity":
        return await getRecentActivity(ctx, input.project_id as string | undefined);
      default:
        return { error: `Outil non implémenté : ${name}` };
    }
  } catch (err) {
    console.error(`[chat-tools] ${name} failed:`, err);
    return {
      error:
        "La requête de données a échoué. Réponds à l'utilisateur sans cette donnée et signale-le.",
    };
  }
}

/** Short description of the tools, injected into the system prompt. */
export const CHAT_TOOLS_PROMPT_SECTION = `
═══════════════════════════════════════════════════════
ACCÈS AUX DONNÉES CANTAIA
═══════════════════════════════════════════════════════

Tu disposes d'outils en LECTURE SEULE sur les données réelles de l'organisation :

- get_project_overview : fiche projet + compteurs (tâches ouvertes/en retard, soumissions, rapports)
- list_overdue_tasks : tâches en retard, filtrables par projet
- get_submission_status : avancement d'une soumission (demandes envoyées / réponses / fournisseurs muets)
- search_data : recherche transversale (projets, tâches, soumissions, fournisseurs, emails)
- get_recent_activity : activité récente d'un projet (emails classés, rapports, PV)

RÈGLES D'USAGE :
1. Dès qu'une question porte sur les données de l'utilisateur (« où en est… », « combien de… », « qui n'a pas répondu », « quoi de neuf sur… »), APPELLE l'outil approprié. N'invente jamais un chiffre.
2. Si un outil retourne \`found: false\` ou \`error\`, dis-le franchement plutôt que de combler le vide.
3. Ces outils ne peuvent RIEN modifier. Si l'utilisateur veut créer ou changer quelque chose, explique-lui l'action à faire dans l'interface.
4. Pour les questions générales de métier (normes SIA, technique, réglementation), réponds directement sans outil.
5. Cite les chiffres tels que retournés, sans les arrondir ni les extrapoler.
`;
