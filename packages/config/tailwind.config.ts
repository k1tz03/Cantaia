import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1E3A5F",
          light: "#2563EB",
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#2563EB",
          600: "#1E3A5F",
          700: "#1A3356",
          800: "#152B4A",
          900: "#0F1F36",
        },
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
