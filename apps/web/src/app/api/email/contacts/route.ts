import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const q = req.nextUrl.searchParams.get("q")?.toLowerCase() || "";
  if (q.length < 2) return NextResponse.json({ contacts: [] });

  // Get user's org
  const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();
  if (!profile?.organization_id) return NextResponse.json({ contacts: [] });

  const contacts: Array<{ email: string; name: string; source: string }> = [];

  // 1. Org members
  const { data: members } = await admin
    .from("users")
    .select("email, first_name, last_name")
    .eq("organization_id", profile.organization_id)
    .neq("id", user.id);
  if (members) {
    for (const m of members) {
      const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email;
      if (name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) {
        contacts.push({ email: m.email, name, source: "team" });
      }
    }
  }

  // 2. Suppliers
  const { data: suppliers } = await admin
    .from("suppliers")
    .select("email, contact_name, company_name")
    .eq("organization_id", profile.organization_id)
    .not("email", "is", null);
  if (suppliers) {
    for (const s of suppliers) {
      if (!s.email) continue;
      const name = s.contact_name || s.company_name || s.email;
      if (name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)) {
        contacts.push({ email: s.email, name, source: "supplier" });
      }
    }
  }

  // 3. Microsoft Graph People API (Outlook contacts + frequent contacts)
  try {
    const token = await getValidMicrosoftToken(user.id);
    if (token) {
      const graphRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/people?$search="${encodeURIComponent(q)}"&$top=10&$select=displayName,scoredEmailAddresses`,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      if (graphRes.ok) {
        const graphData = await graphRes.json();
        const seen = new Set(contacts.map((c) => c.email.toLowerCase()));
        for (const person of graphData.value || []) {
          const email = person.scoredEmailAddresses?.[0]?.address;
          if (!email || seen.has(email.toLowerCase())) continue;
          contacts.push({ email, name: person.displayName || email, source: "outlook" });
          seen.add(email.toLowerCase());
        }
      }
    }
  } catch { /* Graph API not available — continue with other sources */ }

  // 4. Recent senders (from email_records)
  const { data: senders } = await admin
    .from("email_records")
    .select("sender_email, sender_name")
    .eq("user_id", user.id)
    .order("received_at", { ascending: false })
    .limit(200);
  if (senders) {
    const seen = new Set(contacts.map((c) => c.email.toLowerCase()));
    for (const s of senders) {
      if (!s.sender_email || seen.has(s.sender_email.toLowerCase())) continue;
      const name = s.sender_name || s.sender_email;
      if (name.toLowerCase().includes(q) || s.sender_email.toLowerCase().includes(q)) {
        contacts.push({ email: s.sender_email, name, source: "recent" });
        seen.add(s.sender_email.toLowerCase());
      }
    }
  }

  // Deduplicate and limit
  const unique = new Map<string, (typeof contacts)[0]>();
  for (const c of contacts) {
    const key = c.email.toLowerCase();
    if (!unique.has(key)) unique.set(key, c);
  }

  return NextResponse.json({ contacts: Array.from(unique.values()).slice(0, 10) });
}
