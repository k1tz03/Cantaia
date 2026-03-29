import { NextResponse } from "next/server";

/**
 * GET /api/version
 *
 * Retourne la version de l'application et un buildId (commit SHA sur Vercel,
 * timestamp local sinon). Utilisé par le hook useUpdateChecker pour détecter
 * qu'un nouveau déploiement est disponible.
 */
export async function GET() {
  const version = process.env.npm_package_version ?? "1.0.0";
  // VERCEL_GIT_COMMIT_SHA change à chaque déploiement → détection fiable des MAJ
  const buildId =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ??
    process.env.BUILD_ID ??
    version;

  return NextResponse.json({ version, buildId });
}
