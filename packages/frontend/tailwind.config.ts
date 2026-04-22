import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
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
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["SF Mono", "Consolas", "Menlo", "monospace"],
      },
      boxShadow: {
        "app-1": "0 1px 2px rgba(28, 43, 54, 0.06), 0 1px 1px rgba(28, 43, 54, 0.04)",
        "app-2": "0 2px 4px rgba(28, 43, 54, 0.08), 0 1px 2px rgba(28, 43, 54, 0.04)",
        "app-3": "0 6px 16px rgba(28, 43, 54, 0.10), 0 2px 4px rgba(28, 43, 54, 0.05)",
        "app-4": "0 16px 32px rgba(28, 43, 54, 0.14), 0 4px 8px rgba(28, 43, 54, 0.06)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
