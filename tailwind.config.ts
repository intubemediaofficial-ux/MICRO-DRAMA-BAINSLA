import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#09090b", accent: "#f43f5e", gold: "#fbbf24" } } },
  plugins: []
} satisfies Config;
