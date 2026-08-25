import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/benchmarks/projects?project_type=xxx&region=xxx
 *
 * ── C2 GELÉ jusqu'à ≥15 orgs opt-in (audit 08/2026) ──────────────────────
 * Benchmarks projets/tâches/PV calculés sur une poignée d'orgs = valeurs
 * fantômes. État `insufficient_data` propre plutôt que des chiffres trompeurs.
 *
 * Réactivation : restaurer l'implémentation d'origine (git : lecture de
 * `project_benchmarks` + `task_benchmarks` + `pv_quality_benchmarks`).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    status: "insufficient_data",
    reason:
      "C2 gelé jusqu'à ≥15 organisations opt-in — pas assez de contributeurs pour des benchmarks fiables.",
    project_benchmarks: [],
    task_benchmarks: [],
    pv_benchmarks: [],
  });
}
