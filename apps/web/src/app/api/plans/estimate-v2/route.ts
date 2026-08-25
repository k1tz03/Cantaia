import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEstimationPipeline } from "@cantaia/core/plans/estimation/pipeline";
import {
  getBureauProfile,
  updateBureauProfile,
  getQuantityCalibration,
  getPriceCalibration,
} from "@cantaia/core/plans/estimation/calibration-engine";
import { verifyCrossPlan } from "@cantaia/core/plans/estimation";
import { MIN_SAMPLES_FOR_WEIGHTING } from "@cantaia/core/learning";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { insufficientCreditsResponse, grantCredits } from "@/lib/credits";
import { trackApiUsage } from "@cantaia/core/tracking";
import { AI_MODELS } from "@cantaia/core/ai";

// Attribution des tokens par provider au bon fournisseur/modèle pour trackApiUsage.
const PROVIDER_TRACKING: Record<string, { apiProvider: string; model: string }> = {
  claude: { apiProvider: "anthropic", model: AI_MODELS.SONNET },
  gpt4o: { apiProvider: "openai", model: "gpt-4o" },
  gemini: { apiProvider: "google", model: "gemini-2.5-flash" },
};

// Multi-model 4-pass pipeline can take several minutes
export const maxDuration = 300;

/**
 * Télécharge un fichier de plan depuis Supabase Storage.
 *
 * B16 — L'ancien parsing supposait une URL publique
 * (`/storage/v1/object/public/<bucket>/<path>`) et cassait dès que le bucket
 * `plans` passait en privé (URL signée `/object/sign/...?token=…`), ou pour
 * une URL authentifiée `/object/<bucket>/<path>`. On gère les trois formes,
 * puis on retombe sur un `fetch()` direct (utile pour une URL signée encore
 * valide ou un stockage externe).
 */
async function downloadPlanFile(
  admin: any,
  fileUrl: string
): Promise<{ buffer: Buffer } | { error: string }> {
  const match = fileUrl.match(
    /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/?]+)\/(.+?)(?:\?|$)/
  );

  if (match) {
    const bucketName = match[1];
    // Les chemins Storage peuvent contenir des caractères encodés (espaces,
    // accents) — l'API `download()` attend le chemin décodé.
    let objectPath = match[2];
    try {
      objectPath = decodeURIComponent(objectPath);
    } catch {
      /* chemin déjà décodé */
    }

    const { data, error } = await admin.storage.from(bucketName).download(objectPath);
    if (!error && data) {
      return { buffer: Buffer.from(await data.arrayBuffer()) };
    }
    console.warn(
      `[plans] Storage download échoué (bucket=${bucketName}) — fallback fetch direct:`,
      error?.message
    );
  }

  // Fallback : URL signée encore valide, ou hébergement externe.
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) {
      return { error: `HTTP ${res.status} sur le fichier du plan` };
    }
    return { buffer: Buffer.from(await res.arrayBuffer()) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Téléchargement du plan impossible",
    };
  }
}

/**
 * GET /api/plans/estimate-v2?plan_id=xxx
 * Fetch the latest saved estimation for a plan (used after agent completion).
 */
export async function GET(request: NextRequest) {
  const planId = request.nextUrl.searchParams.get("plan_id");
  if (!planId) {
    return NextResponse.json({ error: "plan_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Verify plan belongs to the user's org
  const { data: plan } = await (adminClient as any)
    .from("plan_registry")
    .select("id, organization_id")
    .eq("id", planId)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // Fetch the latest estimation
  const { data: estimate } = await (adminClient as any)
    .from("plan_estimates")
    .select("id, plan_id, estimate_result, grand_total, confidence_summary, created_at")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!estimate?.estimate_result) {
    return NextResponse.json({ error: "No estimation found" }, { status: 404 });
  }

  // `estimate_id` est requis par les boucles d'apprentissage (corrections
  // quantité / calibration prix) : il référence la ligne `plan_estimates`.
  return NextResponse.json({
    estimation: { ...estimate.estimate_result, estimate_id: estimate.id },
  });
}

/**
 * POST /api/plans/estimate-v2
 * Lance le pipeline d'estimation multi-modèle 4 passes
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Récupérer l'org de l'utilisateur
    const { data: userOrg } = await adminClient
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userOrg?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const body = await request.json();
    const { plan_id, project_id, region, type_batiment, acces_chantier, periode_travaux } = body;

    if (!plan_id || !project_id) {
      return NextResponse.json({ error: "plan_id and project_id are required" }, { status: 400 });
    }

    // Verify that the plan belongs to the user's organization
    const { data: planCheck } = await (adminClient as any)
      .from("plan_registry")
      .select("organization_id")
      .eq("id", plan_id)
      .maybeSingle();

    if (!planCheck || planCheck.organization_id !== userOrg.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Récupérer la dernière version du plan
    const { data: version } = await (adminClient as any)
      .from("plan_versions")
      .select("id, file_url, file_name, file_type")
      .eq("plan_id", plan_id)
      .eq("is_current", true)
      .maybeSingle();

    if (!version?.file_url) {
      return NextResponse.json({ error: "No file found for this plan" }, { status: 404 });
    }

    // Télécharger le fichier depuis Supabase Storage (public, signé ou authentifié)
    const download = await downloadPlanFile(adminClient, version.file_url);
    if ("error" in download) {
      console.error("[estimate-v2] Téléchargement du plan échoué:", download.error);
      return NextResponse.json({ error: "Failed to download plan file" }, { status: 500 });
    }

    // Convertir en base64
    const imageBase64 = download.buffer.toString('base64');

    // Déterminer le media type
    const ext = (version.file_name || '').toLowerCase();
    let mediaType = 'image/png';
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mediaType = 'image/jpeg';
    else if (ext.endsWith('.png')) mediaType = 'image/png';
    else if (ext.endsWith('.gif')) mediaType = 'image/gif';
    else if (ext.endsWith('.webp')) mediaType = 'image/webp';
    else if (ext.endsWith('.pdf')) mediaType = 'application/pdf';

    // Vérifier / débiter les crédits SEULEMENT une fois toute la validation
    // passée (body, org-check du plan, version, téléchargement du fichier).
    // AUDIT 08/2026 — checkUsageLimit débite (side effect) : le placer avant la
    // validation faisait perdre 30 crédits sur un 400/403/404/500 sans refund.
    const { data: orgData } = await adminClient
      .from("organizations")
      .select("subscription_plan")
      .eq("id", userOrg.organization_id)
      .single();

    const usageCheck = await checkUsageLimit(adminClient, userOrg.organization_id, orgData?.subscription_plan || "trial", "estimate_v2");
    if (!usageCheck.allowed) {
      if (usageCheck.insufficient_credits) {
        return insufficientCreditsResponse(usageCheck.required_credits ?? 1, usageCheck.remaining_credits ?? 0);
      }
      return NextResponse.json(
        { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
        { status: 429 }
      );
    }
    // Montant réellement débité (pour un éventuel refund si le pipeline échoue).
    const debitedCredits = usageCheck.required_credits ?? 0;

    const regionResolved = region || 'vaud';

    // Calculer les poids des modèles depuis les profils d'erreur de l'ORG.
    //
    // AUDIT 08/2026 — refonte complète de ce bloc :
    //   * la lecture était SANS filtre org (table C2 cross-tenant) → désormais
    //     scopée org_id (migration 102, writer unique dans
    //     @cantaia/core/learning) ;
    //   * bug d'unité : le fallback `0.15` était une FRACTION alors que
    //     `ecart_moyen_pct` est en POURCENTS → un provider sans données pesait
    //     ~2,4× un provider mesuré ;
    //   * poids ÉGAUX tant qu'un provider a moins de MIN_SAMPLES_FOR_WEIGHTING
    //     corrections : on ne pondère que sur de la donnée significative.
    const modelWeights: Record<string, number> = {};
    try {
      const { data: profiles, error: profilesError } = await (adminClient as any)
        .from("model_error_profiles")
        .select("provider, discipline, ecart_median_pct, nb_corrections")
        .eq("org_id", userOrg.organization_id);

      if (profilesError) {
        console.warn("[estimate-v2] model_error_profiles SELECT error:", profilesError.message);
      }

      if (profiles?.length) {
        // Moyenne (pondérée par nb_corrections) des erreurs médianes SIGNÉES,
        // convertie en magnitude — uniquement sur les profils significatifs.
        const byProvider: Record<string, { sum: number; weight: number }> = {};
        for (const p of profiles) {
          const samples = Number(p.nb_corrections) || 0;
          if (samples < MIN_SAMPLES_FOR_WEIGHTING) continue;
          const errAbsPct = Math.abs(Number(p.ecart_median_pct) || 0);
          if (!byProvider[p.provider]) byProvider[p.provider] = { sum: 0, weight: 0 };
          byProvider[p.provider].sum += errAbsPct * samples;
          byProvider[p.provider].weight += samples;
        }

        if (Object.keys(byProvider).length > 0) {
          // Chaque provider CONNU part d'un poids neutre de 1 ; seuls les
          // providers mesurés (≥ MIN_SAMPLES_FOR_WEIGHTING corrections) sont
          // ajustés. Un provider sans données garde exactement 1.
          for (const provider of ["claude", "gpt4o", "gemini"]) {
            const agg = byProvider[provider];
            if (agg && agg.weight > 0) {
              const avgErrorPct = agg.sum / agg.weight; // en %
              modelWeights[provider] = 1 / (1 + avgErrorPct / 100);
            } else {
              modelWeights[provider] = 1;
            }
          }
          // Normaliser pour que la somme ≈ 3.0 (poids neutre de 1 par modèle)
          const sum = Object.values(modelWeights).reduce((a, b) => a + b, 0);
          if (sum > 0) {
            const factor = 3.0 / sum;
            for (const k of Object.keys(modelWeights)) modelWeights[k] *= factor;
          }
          console.log("[estimate-v2] Model weights from error profiles:", JSON.stringify(modelWeights));
        }
      }
    } catch (weightErr) {
      // Non-fatal — on continue sans poids adaptatifs
      console.warn("[estimate-v2] Could not load model error profiles, using equal weights:", weightErr);
    }

    // ── Calibrations apprises (B7) ────────────────────────────────────────
    // Le pipeline accepte `qtyCalibrations` (clé `cfc::unite`) et
    // `priceCalibrations` (clé `cfc::region`) mais PERSONNE ne les remplissait :
    // getQuantityCalibration/getPriceCalibration n'avaient aucun appelant, donc
    // la boucle de calibration était écrite mais jamais relue.
    //
    // On ne connaît les CFC du plan qu'après la Passe 2, donc on précharge les
    // coefficients à partir des corrections déjà enregistrées par l'org.
    const qtyCalibrations = new Map<string, number>();
    const priceCalibrations = new Map<string, number>();
    const MAX_CALIBRATION_LOOKUPS = 40; // borne la latence (chaque lookup = 1-3 requêtes)

    try {
      const { data: qcRows } = await (adminClient as any)
        .from("quantity_corrections")
        .select("cfc_code, unite, discipline, bureau_auteur")
        .eq("org_id", userOrg.organization_id)
        .order("created_at", { ascending: false })
        .limit(500);

      const seenQty = new Set<string>();
      const qtyTargets: Array<{ cfc_code: string; unite: string; discipline: string; bureau_auteur: string | null }> = [];
      for (const row of qcRows ?? []) {
        if (!row.cfc_code || !row.unite) continue;
        const key = `${row.cfc_code}::${row.unite}`;
        if (seenQty.has(key)) continue;
        seenQty.add(key);
        qtyTargets.push({
          cfc_code: row.cfc_code,
          unite: row.unite,
          discipline: row.discipline || "architecture",
          bureau_auteur: row.bureau_auteur ?? null,
        });
        if (qtyTargets.length >= MAX_CALIBRATION_LOOKUPS) break;
      }

      for (const target of qtyTargets) {
        const cal = await getQuantityCalibration({
          org_id: userOrg.organization_id,
          cfc_code: target.cfc_code,
          discipline: target.discipline,
          bureau_auteur: target.bureau_auteur,
          supabase: adminClient,
        });
        // `mv_qty_calibration` exige déjà >= 3 corrections ; on ignore les
        // coefficients neutres pour ne pas polluer la Map.
        if (cal.specificity !== "none" && cal.coefficient > 0 && cal.coefficient !== 1) {
          qtyCalibrations.set(`${target.cfc_code}::${target.unite}`, cal.coefficient);
        }
      }
    } catch (qtyErr) {
      console.warn("[estimate-v2] Chargement des calibrations quantité échoué (non-fatal):", qtyErr);
    }

    try {
      const { data: pcRows } = await (adminClient as any)
        .from("price_calibrations")
        .select("cfc_code")
        .eq("org_id", userOrg.organization_id)
        .eq("region", regionResolved)
        .order("created_at", { ascending: false })
        .limit(500);

      const seenCfc = new Set<string>();
      for (const row of pcRows ?? []) {
        if (!row.cfc_code || seenCfc.has(row.cfc_code)) continue;
        seenCfc.add(row.cfc_code);
        if (seenCfc.size > MAX_CALIBRATION_LOOKUPS) break;

        const cal = await getPriceCalibration({
          org_id: userOrg.organization_id,
          cfc_code: row.cfc_code,
          region: regionResolved,
          supabase: adminClient,
        });
        if (cal.nb_calibrations >= 2 && cal.coefficient > 0 && cal.coefficient !== 1) {
          priceCalibrations.set(`${row.cfc_code}::${regionResolved}`, cal.coefficient);
        }
      }
    } catch (priceErr) {
      console.warn("[estimate-v2] Chargement des calibrations prix échoué (non-fatal):", priceErr);
    }

    if (qtyCalibrations.size > 0 || priceCalibrations.size > 0) {
      console.log(
        `[estimate-v2] Calibrations chargées : ${qtyCalibrations.size} quantité, ${priceCalibrations.size} prix`
      );
    }

    // Récupérer le profil de bureau depuis la dernière analyse connue du plan
    // (le nom du bureau n'est connu qu'après Passe 1, donc on utilise la valeur du dernier run)
    let bureauEnrichment: string | undefined;
    try {
      const { data: lastEstimate } = await (adminClient as any)
        .from("plan_estimates")
        .select("estimate_result")
        .eq("plan_id", plan_id)
        .eq("organization_id", userOrg.organization_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastBureauName = lastEstimate?.estimate_result?.passe1?.cartouche?.auteur_bureau;
      if (lastBureauName) {
        const bureauData = await getBureauProfile({
          org_id: userOrg.organization_id,
          bureau_nom: lastBureauName,
          supabase: adminClient,
        });
        if (bureauData.prompt_enrichment) {
          bureauEnrichment = bureauData.prompt_enrichment;
          console.log(`[estimate-v2] Bureau enrichment loaded for "${lastBureauName}" (bonus: ${bureauData.confidence_bonus})`);
        }
      }
    } catch (bureauErr) {
      // Non-fatal
      console.warn("[estimate-v2] Could not load bureau profile for enrichment:", bureauErr);
    }

    // Lancer le pipeline — si le pipeline échoue APRÈS le débit, on rembourse
    // les crédits (kind:"refund") avant de propager l'erreur.
    let result;
    try {
      result = await runEstimationPipeline({
        plan_id,
        project_id,
        org_id: userOrg.organization_id,
        image_base64: imageBase64,
        media_type: mediaType,
        region: regionResolved,
        type_batiment: type_batiment || 'logement_collectif_standard',
        acces_chantier: acces_chantier || 'normal',
        periode_travaux: periode_travaux || `${new Date().getFullYear()}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}`,
        supabase: adminClient,
        user_id: user.id,
        modelWeights: Object.keys(modelWeights).length > 0 ? (modelWeights as any) : undefined,
        bureauEnrichment,
        qtyCalibrations: qtyCalibrations.size > 0 ? qtyCalibrations : undefined,
        priceCalibrations: priceCalibrations.size > 0 ? priceCalibrations : undefined,
      });
    } catch (pipelineErr) {
      if (debitedCredits > 0) {
        await grantCredits(
          userOrg.organization_id,
          debitedCredits,
          "refund",
          `estimate_v2 pipeline failure plan=${plan_id}`,
          user.id
        ).catch(() => {});
      }
      throw pipelineErr;
    }

    // ── Cost tracking ──────────────────────────────────────
    // AUDIT 08/2026 — le pipeline appelle 3 providers en parallèle (Claude +
    // GPT-4o + Gemini). L'ancien tracking agrégeait TOUT sous une seule ligne
    // `anthropic` avec un split 80/20 arbitraire — les tokens GPT-4o/Gemini
    // (tarifs différents, pourtant couverts par la table de prix du tracker)
    // étaient mal facturés. On émet désormais une ligne PAR provider avec ses
    // tokens réels (`tokens_by_provider`), et on retombe sur l'agrégat Anthropic
    // uniquement si la ventilation n'est pas disponible.
    const stats = result.pipeline_stats;
    const commonMeta = {
      plan_id,
      project_id,
      estimate_id: result.estimate_id ?? null,
      models_used: stats?.models_used,
      total_tokens: stats?.total_tokens,
      pipeline_cost_usd: stats?.total_cost_usd,
      total_duration_ms: stats?.total_duration_ms,
    };

    const byProvider = stats?.tokens_by_provider;
    if (byProvider && Object.values(byProvider).some((t) => t > 0)) {
      for (const [provider, tokens] of Object.entries(byProvider)) {
        if (!tokens || tokens <= 0) continue;
        const mapping = PROVIDER_TRACKING[provider] ?? PROVIDER_TRACKING.claude;
        trackApiUsage({
          supabase: adminClient as any,
          userId: user.id,
          organizationId: userOrg.organization_id,
          actionType: "estimate_v2" as any,
          apiProvider: mapping.apiProvider as any,
          model: mapping.model,
          // Split input/output identique à l'heuristique du job handwritten-notes.
          inputTokens: Math.round(tokens * 0.8),
          outputTokens: Math.round(tokens * 0.2),
          metadata: { ...commonMeta, provider, provider_tokens: tokens },
        }).catch(() => {});
      }
    } else if (stats?.total_tokens) {
      trackApiUsage({
        supabase: adminClient as any,
        userId: user.id,
        organizationId: userOrg.organization_id,
        actionType: "estimate_v2" as any,
        apiProvider: "anthropic",
        model: AI_MODELS.SONNET,
        inputTokens: Math.round(stats.total_tokens * 0.8),
        outputTokens: Math.round(stats.total_tokens * 0.2),
        metadata: commonMeta,
      }).catch(() => {});
    }

    if (!result.estimate_id) {
      // La sauvegarde a échoué (détails dans les logs du pipeline). On renvoie
      // quand même le résultat — mais le client doit savoir que les boucles
      // d'apprentissage (correction quantité / calibration prix) seront
      // indisponibles pour cette estimation.
      console.warn("[estimate-v2] Estimation non persistée — corrections/calibration indisponibles");
    }

    // Mettre à jour le profil du bureau avec le résultat de cette analyse (Passe 1)
    const detectedBureauName = result.passe1?.cartouche?.auteur_bureau;
    if (detectedBureauName) {
      const qualityScore = result.passe3?.score_fiabilite_metrage?.score ?? 50;
      await updateBureauProfile(
        adminClient,
        userOrg.organization_id,
        detectedBureauName,
        qualityScore
      );
      console.log(`[estimate-v2] Bureau profile updated for "${detectedBureauName}" (quality: ${qualityScore})`);
    }

    // Lancer la vérification croisée inter-plans si le projet a au moins 2 plans analysés
    let crossPlanResult = null;
    if (project_id) {
      try {
        const { data: projectPlans } = await (adminClient as any)
          .from("plan_registry")
          .select("id")
          .eq("project_id", project_id)
          .eq("organization_id", userOrg.organization_id);

        if (projectPlans && projectPlans.length >= 2) {
          crossPlanResult = await verifyCrossPlan({
            project_id,
            org_id: userOrg.organization_id,
            supabase: adminClient,
          });
          console.log(`[estimate-v2] Cross-plan verification: score=${crossPlanResult.score_coherence_projet}, alerts=${crossPlanResult.alertes.length}`);
        }
      } catch (crossErr) {
        console.warn("[estimate-v2] Cross-plan verification failed (non-fatal):", crossErr);
      }
    }

    return NextResponse.json({ estimation: result, cross_plan: crossPlanResult });
  } catch (err) {
    console.error("[estimate-v2] Pipeline error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
