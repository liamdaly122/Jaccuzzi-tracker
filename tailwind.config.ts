import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
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
