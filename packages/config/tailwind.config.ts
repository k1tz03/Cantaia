import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0A1F30",
          light: "#1A3A52",
          50: "#E8EEF3",
          100: "#D1DDE7",
          200: "#A3BBCF",
          300: "#7599B7",
          400: "#47779F",
          500: "#1A5587",
          600: "#0A1F30",
          700: "#081A28",
          800: "#061420",
          900: "#040E17",
        },
        gold: {
          DEFAULT: "#C4A661",
          light: "#D4BC82",
          dark: "#A8893D",
          50: "#FBF8F0",
        },
        parchment: "#F5F2EB",
        steel: "#8A9CA8",
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
          light: "#D1FAE5",
        },
        error: {
          DEFAULT: "#EF4444",
          light: "#FEE2E2",
        },
        background: {
          DEFAULT: "#FFFFFF",
          secondary: "#F8FAFC",
          dark: "#0F172A",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        heading: ["Playfair Display", "serif"],
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
