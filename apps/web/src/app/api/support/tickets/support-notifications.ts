import { notifySupportReply, notifySupportTeam } from "@cantaia/core/notifications";

// ============================================================
// Support notification glue
// ============================================================
//
// The support module was fully built and shipped ZERO emails — neither on
// ticket creation nor on reply — so a customer only discovered an answer by
// coming back to the app, and the support desk only discovered a ticket by
// refreshing /super-admin/support.
//
// Every helper here is fire-and-forget: a mail failure must never turn a
// successful reply into a 500.

/**
 * Who staffs the support desk.
 *
 * Primary recipients are the platform superadmins (they own
 * /super-admin/support). If the instance has none — a self-hosted or
 * mid-migration deployment — fall back to the org's own admins/directors so
 * the ticket is not shouted into the void. `SUPPORT_ALERT_EMAIL` overrides
 * everything when set.
 */
export async function resolveSupportDeskEmails(
  admin: any,
  organizationId: string | null
): Promise<string[]> {
  const override = process.env.SUPPORT_ALERT_EMAIL;
  if (override) {
    return override
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
  }

  try {
    const { data: superadmins, error } = await admin
      .from("users")
      .select("email")
      .eq("is_superadmin", true);

    if (error) throw new Error(error.message);

    const emails = (superadmins || [])
      .map((u: { email: string | null }) => u.email)
      .filter((e: string | null): e is string => !!e);

    if (emails.length > 0) return emails;
  } catch (err) {
    console.error(
      "[support-notifications] superadmin lookup failed:",
      err instanceof Error ? err.message : err
    );
  }

  if (!organizationId) return [];

  try {
    const { data: orgAdmins, error } = await admin
      .from("users")
      .select("email, role")
      .eq("organization_id", organizationId)
      .in("role", ["admin", "director"]);

    if (error) throw new Error(error.message);

    return (orgAdmins || [])
      .map((u: { email: string | null }) => u.email)
      .filter((e: string | null): e is string => !!e);
  } catch (err) {
    console.error(
      "[support-notifications] org admin lookup failed:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/** Support desk alert — a user opened a ticket or answered on one. */
export async function alertSupportDesk(
  admin: any,
  opts: {
    organizationId: string | null;
    ticketId: string;
    ticketSubject: string;
    message: string;
    kind: "created" | "replied";
    authorName?: string | null;
  }
): Promise<void> {
  try {
    const to = await resolveSupportDeskEmails(admin, opts.organizationId);
    if (to.length === 0) return;
    await notifySupportTeam({
      to,
      ticketId: opts.ticketId,
      ticketSubject: opts.ticketSubject,
      message: opts.message,
      kind: opts.kind,
      authorName: opts.authorName ?? null,
    });
  } catch (err) {
    console.error(
      "[support-notifications] desk alert failed:",
      err instanceof Error ? err.message : err
    );
  }
}

/** Customer notification — the support desk answered their ticket. */
export async function alertTicketOwner(
  admin: any,
  opts: {
    recipientId: string;
    actorId: string;
    ticketId: string;
    ticketSubject: string;
    message: string;
  }
): Promise<void> {
  try {
    await notifySupportReply(admin, opts);
  } catch (err) {
    console.error(
      "[support-notifications] owner notification failed:",
      err instanceof Error ? err.message : err
    );
  }
}

/** Builds a display name for the email body, never leaking an empty string. */
export function displayName(
  profile: { first_name?: string | null; last_name?: string | null; email?: string | null } | null
): string | null {
  if (!profile) return null;
  const name = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  return name || profile.email || null;
}
