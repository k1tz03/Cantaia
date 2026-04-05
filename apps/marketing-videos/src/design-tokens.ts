/**
 * Cantaia Marketing Videos — Design Tokens
 * Matches the dark zinc/orange design system from the main app.
 */

export const COLORS = {
  // Backgrounds
  bgDeep: "#09090B",
  bgBase: "#0F0F11",
  bgCard: "#18181B",
  bgElevated: "#1C1C1F",

  // Borders
  border: "#27272A",
  borderHover: "#3F3F46",

  // Text
  white: "#FAFAFA",
  secondary: "#A1A1AA",
  muted: "#71717A",
  faint: "#52525B",

  // Accent
  orange: "#F97316",
  orangeDark: "#EA580C",
  orangeLight: "#FFF7ED",

  // Status
  blue: "#3B82F6",
  green: "#10B981",
  greenBright: "#22C55E",
  red: "#EF4444",
  amber: "#F59E0B",
} as const;

export const FONTS = {
  display: "Plus Jakarta Sans, Inter, system-ui, sans-serif",
  body: "Inter, system-ui, sans-serif",
  mono: "JetBrains Mono, monospace",
} as const;

/** Safe zones: 5% margin on all sides for social media */
export const SAFE_ZONE = {
  horizontal: 96, // 1920 * 0.05
  vertical: 54, // 1080 * 0.05
} as const;

export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;
