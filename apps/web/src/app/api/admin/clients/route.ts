import { NextResponse } from "next/server";

export async function GET() {
  // Step 8: Admin clients API
  return NextResponse.json(
    { error: "Not implemented — see Step 8" },
    { status: 501 }
  );
}
