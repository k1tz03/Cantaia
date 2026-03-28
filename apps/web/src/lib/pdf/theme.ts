export const C = {
  orange:      '#F97316',
  black:       '#0A0A0A',
  darkGray:    '#3F3F46',
  medGray:     '#71717A',
  lightGray:   '#A1A1AA',
  faint:       '#F4F4F5',
  border:      '#F0EFEB',
  white:       '#FFFFFF',
  green:       '#16A34A',
  red:         '#DC2626',
  amber:       '#EA580C',
  redLight:    '#FEF2F2',
  amberLight:  '#FFF7ED',
  greenLight:  '#F0FDF4',
  urgentBg:    '#FFF4F0',
  urgentBdr:   '#FED7AA',
  normalBg:    '#F0F9FF',
  normalClr:   '#0284C7',
} as const;

/** Base font — Helvetica is always available in PDF, no network needed */
export const FONT = {
  regular: 'Helvetica',
  bold:    'Helvetica-Bold',
  oblique: 'Helvetica-Oblique',
} as const;

export const SIZE = {
  pageH: 841.89,
  pageW: 595.28,
  pagePad: 40,
  footerH: 40,
} as const;
