import type { Config } from "tailwindcss";

const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const variableScale = (name: string) =>
  Object.fromEntries(shades.map((shade) => [
    shade,
    `rgb(var(--${name}-${shade}) / <alpha-value>)`,
  ]));

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#09090b",
        accent: "rgb(var(--brand-500) / <alpha-value>)",
        rose: variableScale("brand"),
        zinc: variableScale("neutral"),
        gold: "rgb(var(--accent-gold) / <alpha-value>)",
      },
    },
  },
  plugins: [],
} satisfies Config;
