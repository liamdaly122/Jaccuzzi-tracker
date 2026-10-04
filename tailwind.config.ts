import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-figtree)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "18px",
        ctl: "12px",
      },
      colors: {
        // Semantic tokens (app/globals.css). Use these, not raw palettes.
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        track: "rgb(var(--track) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-2": "rgb(var(--ink-2) / <alpha-value>)",
        "ink-3": "rgb(var(--ink-3) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "on-accent": "rgb(var(--on-accent) / <alpha-value>)",
        "accent-ink": "rgb(var(--accent-ink) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft) / <alpha-value>)",
        heat: "rgb(var(--heat) / <alpha-value>)",
        "heat-ink": "rgb(var(--heat-ink) / <alpha-value>)",
        "heat-soft": "rgb(var(--heat-soft) / <alpha-value>)",
        good: "rgb(var(--good) / <alpha-value>)",
        "good-ink": "rgb(var(--good-ink) / <alpha-value>)",
        "good-soft": "rgb(var(--good-soft) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        "warn-ink": "rgb(var(--warn-ink) / <alpha-value>)",
        "warn-soft": "rgb(var(--warn-soft) / <alpha-value>)",
        bad: "rgb(var(--bad) / <alpha-value>)",
        "bad-ink": "rgb(var(--bad-ink) / <alpha-value>)",
        "bad-soft": "rgb(var(--bad-soft) / <alpha-value>)",
        brand: {
          50: "#eff9ff",
          100: "#dbf1ff",
          200: "#bfe7ff",
          300: "#93d8ff",
          400: "#60c1ff",
          500: "#3aa4fb",
          600: "#2385f0",
          700: "#1b6cdd",
          800: "#1d57b3",
          900: "#1e4b8d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
