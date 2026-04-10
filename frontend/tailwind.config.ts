import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          green: { DEFAULT: "#25D366", dark: "#128C7E", light: "#E8F5E9", pale: "#F0FBF2" },
          ink: { DEFAULT: "#0F1923", 60: "#667788", 30: "#B8C4CC", 10: "#EEF2F5", "05": "#F7FAFB" },
          red: { DEFAULT: "#EF4444", light: "#FEF2F2" },
          amber: { DEFAULT: "#F59E0B", light: "#FFFBEB" },
          blue: { DEFAULT: "#3B82F6", light: "#EFF6FF" },
          purple: { DEFAULT: "#5B21B6", light: "#EDE9FE" },
        },
      },
      borderRadius: { card: "12px", sm: "8px", pill: "20px" },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"DM Mono"', "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.05)",
        md: "0 4px 16px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.06)",
      },
    },
  },
  plugins: [],
};

export default config;
