import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn/ui CSS variable colors
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Cantaia brand colors
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
          100: "#F5EDD8",
          200: "#EBDBB1",
          300: "#E0C98A",
          400: "#D4BC82",
          500: "#C4A661",
          600: "#B0914A",
          700: "#8A7139",
          800: "#655229",
          900: "#3F3318",
        },
        parchment: "#F5F2EB",
        steel: "#8A9CA8",
        success: {
          DEFAULT: "#10B981",
          light: "#D1FAE5",
        },
        error: {
          DEFAULT: "#EF4444",
          light: "#FEE2E2",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "Playfair Display", "serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      fontSize: {
        compact: ["13px", { lineHeight: "18px" }],
      },
      boxShadow: {
        soft: "0 4px 6px rgba(10, 31, 48, 0.05)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
