import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

type Contact = { email: string; name: string; source: string };

/**
 * Extract unique contacts from Graph message senders/recipients.
 * Works with the `Mail.Read` scope (no extra People.Read needed).
 */
function extractContactsFromMessages(
  messages: any[],
  query: string,
  seen: Set<string>
): Contact[] {
  const results: Contact[] = [];
  const q = query.toLowerCase();

  for (const msg of messages) {
    // From
    const fromAddr = msg.from?.emailAddress?.address;
    const fromName = msg.from?.emailAddress?.name || "";
    if (fromAddr && !seen.has(fromAddr.toLowerCase())) {
      if (fromName.toLowerCase().includes(q) || fromAddr.toLowerCase().includes(q)) {
        results.push({ email: fromAddr, name: fromName || fromAddr, source: "outlook" });
        seen.add(fromAddr.toLowerCase());
      }
    }

    // To recipients
    for (const r of msg.toRecipients || []) {
      const addr = r.emailAddress?.address;
      const name = r.emailAddress?.name || "";
      if (addr && !seen.has(addr.toLowerCase())) {
        if (name.toLowerCase().includes(q) || addr.toLowerCase().includes(q)) {
          results.push({ email: addr, name: name || addr, source: "outlook" });
          seen.add(addr.toLowerCase());
        }
      }
    }

    // CC recipients
    for (const r of msg.ccRecipients || []) {
      const addr = r.emailAddress?.address;
      const name = r.emailAddress?.name || "";
      if (addr && !seen.has(addr.toLowerCase())) {
        if (name.toLowerCase().includes(q) || addr.toLowerCase().includes(q)) {
          results.push({ email: addr, name: name || addr, source: "outlook" });
          seen.add(addr.toLowerCase());
        }
      }
    }
  }
  return results;
}

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

  const contacts: Contact[] = [];
  const seen = new Set<string>();

  // ── 1. Microsoft Graph — search via messages (uses Mail.Read scope) ──
  // This is the PRIMARY source — Outlook correspondents
  try {
    const tokenResult = await getValidMicrosoftToken(user.id);
    if (!("error" in tokenResult)) {
      const token = tokenResult.accessToken;

      // Strategy A: Try People API first (requires People.Read scope — may fail)
      let peopleDone = false;
      try {
        const peopleRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/people?$search="${encodeURIComponent(q)}"&$top=15&$select=displayName,scoredEmailAddresses`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (peopleRes.ok) {
          const peopleData = await peopleRes.json();
          for (const person of peopleData.value || []) {
            const email = person.scoredEmailAddresses?.[0]?.address;
            if (!email || seen.has(email.toLowerCase())) continue;
            contacts.push({ email, name: person.displayName || email, source: "outlook" });
            seen.add(email.toLowerCase());
          }
          peopleDone = contacts.length > 0;
        }
      } catch { /* People.Read not available */ }

      // Strategy B: Search through recent messages (always works with Mail.Read)
      // B7: Graph rejects $search combined with $orderby ("Sorting not supported
      // for search requests") — the 400 was swallowed and this strategy never
      // returned anything. $search results are already relevance-ranked.
      if (!peopleDone) {
        try {
          const msgRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(q)}"&$select=from,toRecipients,ccRecipients&$top=50`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                ConsistencyLevel: "eventual",
              },
            }
          );
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            const msgContacts = extractContactsFromMessages(msgData.value || [], q, seen);
            contacts.push(...msgContacts);
          } else if (process.env.NODE_ENV === "development") {
            console.warn(`[contacts] Graph messages search failed: ${msgRes.status} ${await msgRes.text()}`);
          }
        } catch { /* Messages search failed */ }
      }

      // Strategy C: Try Contacts API (requires Contacts.Read — may fail)
      // B7: the previous $filter was invalid OData — `startswith(emailAddresses/any(...))`
      // is not a valid expression (the lambda must wrap the predicate, not the
      // other way round). Use the corrected filter, and fall back to a plain
      // page + local filtering when Graph still rejects it.
      if (contacts.length < 5) {
        const addContactRows = (rows: any[], filterLocally: boolean) => {
          for (const c of rows) {
            const emailEntry = (c.emailAddresses || []).find((e: any) => e?.address);
            const email = emailEntry?.address;
            if (!email || seen.has(email.toLowerCase())) continue;
            const name = c.displayName || emailEntry?.name || email;
            if (
              filterLocally &&
              !name.toLowerCase().includes(q) &&
              !email.toLowerCase().includes(q)
            ) {
              continue;
            }
            contacts.push({ email, name, source: "outlook" });
            seen.add(email.toLowerCase());
          }
        };

        // OData string literals escape a single quote by doubling it.
        const odataQ = encodeURIComponent(q.replace(/'/g, "''"));
        let contactsHandled = false;
        try {
          const contactsRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/contacts?$filter=emailAddresses/any(a:startswith(a/address,'${odataQ}')) or startswith(displayName,'${odataQ}')&$top=10&$select=displayName,emailAddresses`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                ConsistencyLevel: "eventual",
              },
            }
          );
          if (contactsRes.ok) {
            const contactsData = await contactsRes.json();
            addContactRows(contactsData.value || [], false);
            contactsHandled = true;
          } else if (process.env.NODE_ENV === "development") {
            console.warn(`[contacts] Graph contacts $filter failed: ${contactsRes.status}`);
          }
        } catch { /* Contacts.Read not available */ }

        // Fallback: no $filter, filter locally
        if (!contactsHandled) {
          try {
            const plainRes = await fetch(
              `https://graph.microsoft.com/v1.0/me/contacts?$top=50&$select=displayName,emailAddresses`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (plainRes.ok) {
              const plainData = await plainRes.json();
              addContactRows(plainData.value || [], true);
            }
          } catch { /* Contacts.Read not available */ }
        }
      }
    }
  } catch { /* Graph API not available */ }

  // ── 2. Org members ──
  const { data: members } = await admin
    .from("users")
    .select("email, first_name, last_name")
    .eq("organization_id", profile.organization_id)
    .neq("id", user.id);
  if (members) {
    for (const m of members) {
      if (seen.has(m.email.toLowerCase())) continue;
      const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email;
      if (name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) {
        contacts.push({ email: m.email, name, source: "team" });
        seen.add(m.email.toLowerCase());
      }
    }
  }

  // ── 3. Suppliers ──
  const { data: suppliers } = await admin
    .from("suppliers")
    .select("email, contact_name, company_name")
    .eq("organization_id", profile.organization_id)
    .not("email", "is", null);
  if (suppliers) {
    for (const s of suppliers) {
      if (!s.email || seen.has(s.email.toLowerCase())) continue;
      const name = s.contact_name || s.company_name || s.email;
      if (name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)) {
        contacts.push({ email: s.email, name, source: "supplier" });
        seen.add(s.email.toLowerCase());
      }
    }
  }

  // ── 4. Recent senders from DB (fallback if Graph unavailable) ──
  if (contacts.filter((c) => c.source === "outlook").length === 0) {
    const { data: senders } = await admin
      .from("email_records")
      .select("sender_email, sender_name")
      .eq("user_id", user.id)
      .order("received_at", { ascending: false })
      .limit(200);
    if (senders) {
      for (const s of senders) {
        if (!s.sender_email || seen.has(s.sender_email.toLowerCase())) continue;
        const name = s.sender_name || s.sender_email;
        if (name.toLowerCase().includes(q) || s.sender_email.toLowerCase().includes(q)) {
          contacts.push({ email: s.sender_email, name, source: "recent" });
          seen.add(s.sender_email.toLowerCase());
        }
      }
    }
  }

  // Limit to 15 results
  return NextResponse.json({ contacts: contacts.slice(0, 15) });
}
