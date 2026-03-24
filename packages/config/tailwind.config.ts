import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#F97316",
          hover: "#EA580C",
          light: "#FFF7ED",
          50: "#FFF7ED",
          100: "#FFEDD5",
          200: "#FED7AA",
          300: "#FDBA74",
          400: "#FB923C",
          500: "#F97316",
          600: "#EA580C",
          700: "#C2410C",
          800: "#9A3412",
          900: "#7C2D12",
        },
        gold: {
          DEFAULT: "#F97316",
          light: "#FB923C",
          dark: "#EA580C",
          50: "#FFF7ED",
        },
        parchment: "#FAFAFA",
        steel: "#71717A",
        amber: {
          DEFAULT: "#F59E0B",
          50: "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
          800: "#92400E",
          900: "#78350F",
        },
        success: {
          DEFAULT: "#10B981",
          light: "#ECFDF5",
        },
        warning: {
          DEFAULT: "#F59E0B",
          light: "#FFFBEB",
        },
        error: {
          DEFAULT: "#EF4444",
          light: "#FEF2F2",
        },
        background: {
          DEFAULT: "#FAFAFA",
          secondary: "#F4F4F5",
          dark: "#0F0F11",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        heading: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        compact: ["13px", { lineHeight: "18px" }],
      },
    },
  },
  plugins: [],
};

export default config;
