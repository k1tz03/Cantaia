/**
 * Delivery-note photo URLs — stored as a storage PATH, re-signed on read.
 *
 * The `site-report-photos` bucket is private (migration 086). Storing a
 * long-lived signed URL verbatim on the entry meant that revoking or expiring a
 * public share link did NOT cut off access to the photos: anyone who had loaded
 * the page once kept a ~10-year URL. We now persist the storage PATH and mint a
 * short-lived signed URL at read time, so access follows the share link's life.
 *
 * Legacy rows still hold a full https URL — those are returned as-is so old
 * reports keep rendering. Anything that is not a bucket path and not an http URL
 * (a `data:` URI, a foreign URL) resolves to null rather than being echoed back.
 *
 * Lives under lib/portal because the field portal owns the capture flow; the
 * back-office site-report routes reuse it for their read paths.
 */

const BUCKET = "site-report-photos";
/** Short enough to be worthless once the share link is revoked, long enough for
 *  a page load + the images to fetch. */
const READ_TTL_SECONDS = 60 * 60; // 1 h

/** A value that must be re-signed (a storage path, not a URL or data URI). */
export function isStoredPhotoPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !/^https?:\/\//i.test(value) &&
    !value.startsWith("data:")
  );
}

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrls: (
        paths: string[],
        expiresIn: number,
      ) => Promise<{ data: Array<{ path?: string | null; signedUrl?: string | null }> | null; error: unknown }>;
    };
  };
};

/**
 * Build a `path → short-lived signed URL` map for a batch of stored values.
 * Legacy full URLs are not included (the caller returns them unchanged).
 */
export async function signPhotoPaths(
  admin: StorageClient,
  values: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const paths = Array.from(new Set(values.filter(isStoredPhotoPath) as string[]));
  const out = new Map<string, string>();
  if (paths.length === 0) return out;

  try {
    const { data } = await admin.storage.from(BUCKET).createSignedUrls(paths, READ_TTL_SECONDS);
    for (const row of data || []) {
      if (row?.path && row?.signedUrl) out.set(row.path, row.signedUrl);
    }
  } catch (error) {
    console.warn("[portal/photos] createSignedUrls failed:", error);
  }
  return out;
}

/**
 * Display URL for one stored value: a legacy https URL is returned verbatim, a
 * storage path is looked up in `signed`, anything else (including a foreign URL
 * or data URI slipped past validation) resolves to null.
 */
export function displayPhotoUrl(
  value: string | null | undefined,
  signed: Map<string, string>,
): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value; // legacy full URL
  if (value.startsWith("data:")) return null; // never echo a data URI back
  return signed.get(value) ?? null;
}
