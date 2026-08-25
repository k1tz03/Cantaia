// ============================================================
// AI Scheduler — Natural language commands for calendar
// ============================================================
// Parses natural language commands into calendar actions using
// Claude Haiku for fast, low-cost parsing.

import type { AICommandResult } from "./types";
import {
  AI_MODELS,
  callAnthropicWithRetry,
  parseAIJson,
  classifyAIError,
} from "../ai/ai-utils";
import { graphDateTimeToUtcIso } from "./calendar-sync";

// ── Parse Natural Language Command ─────────────────────────

/**
 * CAL.C1: the LLM returns naive ISO datetimes ("2026-08-25T14:00:00") that
 * express Europe/Zurich wall time. Convert them to true UTC instants so
 * Postgres (timestamptz) does not misread them as UTC. Datetimes that already
 * carry an offset/Z are passed through unchanged.
 */
function normalizeAiDateTime(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return graphDateTimeToUtcIso(value, "Europe/Zurich");
}

/**
 * Parse a natural language command into a calendar action.
 * Uses Claude Haiku for fast interpretation.
 */
export async function parseCalendarCommand(
  command: string,
  context: {
    userId: string;
    orgId: string;
    today: string;
    projectNames: string[];
    teamMembers: Array<{ name: string; email: string }>;
    locale: "fr" | "en" | "de";
  }
): Promise<AICommandResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  // maxRetries:0 — retries are owned by callAnthropicWithRetry below, so the
  // SDK's own retry loop must be disabled to avoid a double retry (§8).
  const client = new Anthropic({ maxRetries: 0 });

  const systemPrompt = `Tu es un assistant calendrier pour Cantaia, un logiciel de gestion de chantier suisse.
Tu interpretes des commandes en langage naturel pour creer des evenements, trouver des creneaux, ou resumer la journee.

Date d'aujourd'hui: ${context.today}
Projets actifs: ${context.projectNames.join(", ") || "aucun"}
Membres de l'equipe: ${context.teamMembers.map(m => `${m.name} (${m.email})`).join(", ") || "aucun"}

Retourne un JSON avec la structure suivante:
{
  "action": "create_event" | "find_slot" | "optimize_week" | "summary" | "unknown",
  "event": { // si action = create_event
    "title": "...",
    "start_at": "ISO datetime",
    "end_at": "ISO datetime",
    "event_type": "meeting" | "site_visit" | "call" | "deadline" | "construction",
    "location": "..." ou null,
    "project_id_hint": "nom du projet mentionne" ou null,
    "attendees": [{"email": "...", "name": "..."}]
  },
  "slots": [ // si action = find_slot
    {"start_at": "ISO", "end_at": "ISO", "score": 0.0-1.0}
  ],
  "message": "Message a afficher a l'utilisateur (toujours en francais)"
}

Regles:
- Si l'heure n'est pas precisee, propose 09:00
- Si la duree n'est pas precisee, utilise 1h pour les reunions, 30min pour les appels
- Fais correspondre les prenoms aux membres de l'equipe
- Fais correspondre les mots-cles (CVC, electricite, etc.) aux noms de projets
- Les jours de la semaine sont relatifs a aujourd'hui
- Timezone: Europe/Zurich

Reponds UNIQUEMENT avec le JSON, sans texte avant ou apres.`;

  try {
    const response = await callAnthropicWithRetry(
      () =>
        client.messages.create({
          model: AI_MODELS.HAIKU,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: command }],
        }),
      { maxRetries: 2 }
    );

    const text = response.content
      .filter(b => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Tolerant JSON parse (handles fences / stray prose) — no assistant prefill.
    const usage = {
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0,
    };

    const parsed = parseAIJson<any>(text);
    if (!parsed) {
      return {
        action: "unknown",
        message: "Je n'ai pas compris la commande. Essayez: 'reunion CVC mardi 14h avec Sophie'",
        usage,
      };
    }

    // Map project name hint to actual project ID if available
    const result: AICommandResult = {
      action: parsed.action || "unknown",
      message: parsed.message || "Commande traitee.",
      usage,
    };

    if (parsed.action === "create_event" && parsed.event) {
      result.event = {
        title: parsed.event.title,
        start_at: normalizeAiDateTime(parsed.event.start_at),
        end_at: normalizeAiDateTime(parsed.event.end_at),
        event_type: parsed.event.event_type || "meeting",
        location: parsed.event.location || undefined,
        description: parsed.event.description || undefined,
        attendees: parsed.event.attendees || [],
        // Pass-through for project resolution in the route
        project_id_hint: parsed.event.project_id_hint || undefined,
      } as any;
    }

    if (parsed.action === "find_slot" && parsed.slots) {
      result.slots = parsed.slots;
    }

    if (parsed.action === "summary") {
      result.summary = parsed.summary || parsed.message;
    }

    return result;
  } catch (error: unknown) {
    const classified = classifyAIError(error, context.locale);
    console.error("[ai-scheduler] Error parsing command:", classified.message);
    return {
      action: "unknown",
      message: classified.message,
    };
  }
}

// ── Conflict Detection ─────────────────────────────────────

export interface ConflictInfo {
  event_id: string;
  title: string;
  start_at: string;
  end_at: string;
  user_name: string | null;
}

/**
 * Detect scheduling conflicts for a proposed time range.
 */
export async function detectConflicts(
  admin: any,
  _userId: string,
  orgId: string,
  startAt: string,
  endAt: string,
  excludeEventId?: string
): Promise<ConflictInfo[]> {
  let query = admin
    .from("calendar_events")
    .select("id, title, start_at, end_at, user_id, users!inner(first_name, last_name)")
    .eq("organization_id", orgId)
    .neq("status", "cancelled")
    .lt("start_at", endAt)
    .gt("end_at", startAt);

  if (excludeEventId) {
    query = query.neq("id", excludeEventId);
  }

  const { data } = await query.limit(10);

  return (data || []).map((e: any) => ({
    event_id: e.id,
    title: e.title,
    start_at: e.start_at,
    end_at: e.end_at,
    user_name: e.users
      ? `${e.users.first_name || ""} ${e.users.last_name || ""}`.trim()
      : null,
  }));
}

// ── Meeting Prep Suggestions ───────────────────────────────

/**
 * Generate AI-suggested agenda items for a meeting based on project context.
 * Used in the CreateEventModal.
 */
export async function suggestAgendaItems(
  projectMemory: {
    summary: string | null;
    active_risks: Array<{ risk: string; severity: string }>;
    open_items: Array<{ item: string; type: string }>;
    pending_decisions: Array<{ decision: string }>;
  } | null
): Promise<Array<{ topic: string; selected: boolean }>> {
  if (!projectMemory) return [];

  const suggestions: Array<{ topic: string; selected: boolean }> = [];

  // Add risks as suggested topics
  for (const risk of (projectMemory.active_risks || []).slice(0, 3)) {
    if (risk.severity === "high" || risk.severity === "critical") {
      suggestions.push({ topic: risk.risk, selected: true });
    }
  }

  // Add pending decisions
  for (const decision of (projectMemory.pending_decisions || []).slice(0, 2)) {
    suggestions.push({ topic: decision.decision, selected: false });
  }

  // Add critical open items
  for (const item of (projectMemory.open_items || []).slice(0, 3)) {
    if (item.type === "reserve" || item.type === "submission") {
      suggestions.push({ topic: item.item, selected: false });
    }
  }

  return suggestions.slice(0, 6);
}
