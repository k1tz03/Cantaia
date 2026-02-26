import { NextResponse } from "next/server";

export async function POST() {
  // Step 11: Stripe webhook handler
  return NextResponse.json(
    { error: "Not implemented — see Step 11" },
    { status: 501 }
  );
}
