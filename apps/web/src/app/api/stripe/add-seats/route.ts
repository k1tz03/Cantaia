import { NextResponse } from "next/server";

/**
 * POST /api/stripe/add-seats — RETIRED (410 Gone).
 *
 * This route implemented seat add-ons on the legacy flat-fee model
 * (base "3 seats" + STRIPE_PRICE_PRO_EXTRA_USER add-on item). No UI ever
 * called it, and billing is migrating to a credits-based system in the
 * next phase, which replaces per-seat management entirely.
 *
 * The file is kept so the endpoint answers explicitly instead of 404ing.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Cette API a été retirée : la gestion des sièges est remplacée par le système de crédits.",
    },
    { status: 410 }
  );
}
