// ============================================================
// Cantaia — Branding resolver for financial documents
// ============================================================
// Every generated document (régie sheet, payroll export, hours/notes PDF) must
// carry the customer's letterhead: `organizations.logo_url` existed for months
// and was consumed by exactly zero generator.
//
// The canonical implementation is `getOrgBranding()` in @cantaia/core/branding
// (owned by Agent O). That module does not exist yet at the time of writing and
// is not in the package `exports` map, so a static import would break the build.
// This resolver therefore:
//   1. tries to load the shared module at runtime (hidden from the bundler so
//      an absent module is a caught runtime error, not a build failure),
//   2. otherwise reads `organizations` directly — same three fields, same
//      defaults, so the output is identical either way.
//
// INTEGRATION NOTE: once @cantaia/core/branding ships and is listed in
// packages/core/package.json `exports`, replace `loadSharedBranding()` with a
// plain `import { getOrgBranding } from "../branding"` and delete the loader.

export interface OrgBranding {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
}

/** Cantaia defaults — used when the org row is missing or unreadable. */
export const DEFAULT_BRANDING: OrgBranding = {
  name: "Cantaia",
  logoUrl: null,
  primaryColor: "#F97316",
};

type MinimalClient = {
  from: (table: string) => any;
};

/**
 * Runtime-only module load. The specifier is assembled at call time so neither
 * webpack nor turbopack tries to resolve it during the build; when the module
 * is absent (today) the import rejects and we fall through to the DB read.
 */
async function loadSharedBranding(): Promise<
  ((admin: unknown, orgId: string) => Promise<OrgBranding>) | null
> {
  try {
    const specifier = ["@cantaia", "core", "branding"].join("/");
    // eslint-disable-next-line no-new-func
    const dynamicImport = new Function("s", "return import(s)") as (
      s: string,
    ) => Promise<Record<string, unknown>>;
    const mod = await dynamicImport(specifier);
    const fn = mod?.getOrgBranding;
    return typeof fn === "function"
      ? (fn as (admin: unknown, orgId: string) => Promise<OrgBranding>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolve an organization's letterhead. Never throws — a branding failure must
 * not take a document export down with it.
 */
export async function resolveOrgBranding(
  admin: MinimalClient,
  orgId: string | null | undefined,
): Promise<OrgBranding> {
  if (!orgId) return { ...DEFAULT_BRANDING };

  const shared = await loadSharedBranding();
  if (shared) {
    try {
      const branding = await shared(admin, orgId);
      if (branding?.name) return branding;
    } catch {
      /* fall through to the direct read */
    }
  }

  try {
    const { data, error } = await (admin as any)
      .from("organizations")
      .select("name, logo_url, primary_color")
      .eq("id", orgId)
      .maybeSingle();

    if (error || !data) return { ...DEFAULT_BRANDING };

    return {
      name: data.name || DEFAULT_BRANDING.name,
      logoUrl: data.logo_url || null,
      primaryColor: data.primary_color || DEFAULT_BRANDING.primaryColor,
    };
  } catch {
    return { ...DEFAULT_BRANDING };
  }
}

/** #RRGGBB → [r, g, b] for jsPDF's `setTextColor`/`setFillColor`. */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || "").replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [249, 115, 22]; // Cantaia orange
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}
