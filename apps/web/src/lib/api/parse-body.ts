/**
 * Parse le body JSON d'une requête de manière sécurisée.
 * Retourne { data, error }.
 * Si error → retourner NextResponse.json({ error }, { status: 400 })
 */
export async function parseBody<T = any>(
  request: Request
): Promise<{ data: T | null; error: string | null }> {
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return { data: null, error: "Content-Type must be application/json" };
    }

    const text = await request.text();
    if (!text || text.trim() === "") {
      return { data: null, error: "Request body is empty" };
    }

    const data = JSON.parse(text) as T;
    return { data, error: null };
  } catch {
    return { data: null, error: "Invalid JSON in request body" };
  }
}

/**
 * Vérifier que les champs requis sont présents.
 */
export function validateRequired(
  data: Record<string, any>,
  fields: string[]
): string | null {
  const missing = fields.filter(
    (f) => data[f] === undefined || data[f] === null || data[f] === ""
  );
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
}
