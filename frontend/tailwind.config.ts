import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: {
            DEFAULT: "#1B2A4A",
            light: "#1B2A4A",
            dark: "#0F1B33",
            darkest: "#0B1628",
          },
          teal: {
            DEFAULT: "#0D9488",
          },
        },
      },
      borderRadius: {
        pill: "1.375rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
