// ---------------------------------------------------------------------------
// Shared types and helpers for the Submissions module
// ---------------------------------------------------------------------------

export interface ExtractedPosition {
  id: string;
  position_number: string;
  can_code: string | null;
  description: string;
  quantity: number | null;
  unit: string;
  unit_price: number | null;
  total: number | null;
  confidence: number;
  flags: string[];
  is_new?: boolean;
}

export interface ExtractionMetadata {
  source_type: string;
  total_positions: number;
  flagged_positions: number;
  extraction_time_ms: number;
  project_suggestion: string | null;
  document_title: string | null;
  cfc_chapter: string | null;
  currency: string;
}

export interface SavedSubmission {
  id: string;
  name: string;
  source_filename: string;
  source_type: string;
  positions: ExtractedPosition[];
  metadata: ExtractionMetadata | null;
  status: "extracting" | "draft" | "reviewed" | "exported" | "archived";
  total_positions: number;
  flagged_positions: number;
  created_at: string;
  updated_at: string;
  exported_at: string | null;
  export_format: string | null;
}

export type ViewMode = "list" | "editor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function ensureIds(positions: any[]): ExtractedPosition[] {
  return positions.map((p) => ({
    ...p,
    id: p.id || crypto.randomUUID(),
  }));
}

export function createEmptyPosition(): ExtractedPosition {
  return {
    id: crypto.randomUUID(),
    position_number: "",
    can_code: null,
    description: "",
    quantity: null,
    unit: "",
    unit_price: null,
    total: null,
    confidence: 1,
    flags: [],
    is_new: true,
  };
}

function getStorageKey(prefix: string) {
  return `cantaia_submissions_${prefix}`;
}

export function loadSubmissionsFromStorage(): SavedSubmission[] {
  try {
    const raw = localStorage.getItem(getStorageKey("list"));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSubmissionsToStorage(submissions: SavedSubmission[]) {
  localStorage.setItem(getStorageKey("list"), JSON.stringify(submissions));
}

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin}min`;
  if (diffHr < 24) return `il y a ${diffHr}h`;
  if (diffDay < 7) return `il y a ${diffDay}j`;
  return date.toLocaleDateString("fr-CH");
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
