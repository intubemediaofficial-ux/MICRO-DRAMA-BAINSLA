import colors from "tailwindcss/colors";

export type NeutralPreset = "zinc" | "slate" | "stone" | "neutral" | "gray";
export type ThemeScale = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>;

const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const lightMix: Record<number, number> = { 50: 0.94, 100: 0.88, 200: 0.76, 300: 0.56, 400: 0.28 };
const darkMix: Record<number, number> = { 600: 0.08, 700: 0.22, 800: 0.36, 900: 0.52, 950: 0.74 };

function parseHex(hex: string): [number, number, number] {
  const normalized = hex.trim().replace(/^#/, "");
  const expanded = normalized.length === 3 ? normalized.split("").map((part) => part + part).join("") : normalized;
  if (!/^[\da-f]{6}$/i.test(expanded)) throw new Error("INVALID_HEX_COLOR");
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

function rgbString([red, green, blue]: [number, number, number]) {
  return `${red} ${green} ${blue}`;
}

function fromHex(hex: string) {
  return rgbString(parseHex(hex));
}

export function brandScale(hex: string): ThemeScale {
  const [red, green, blue] = parseHex(hex);
  const normalized = `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  if (normalized === "#f43f5e") {
    const rose = colors.rose as Record<(typeof shades)[number], string>;
    return Object.fromEntries(shades.map((shade) => [shade, fromHex(rose[shade])])) as ThemeScale;
  }
  const original: [number, number, number] = [red, green, blue];
  return Object.fromEntries(shades.map((shade) => {
    const weight = shade === 500 ? 0 : lightMix[shade] ?? darkMix[shade] ?? 0;
    const target = shade < 500 ? 255 : 0;
    const mixed = original.map((channel) => Math.round(channel * (1 - weight) + target * weight)) as [
      number,
      number,
      number,
    ];
    return [shade, rgbString(mixed)];
  })) as ThemeScale;
}

export function neutralScale(preset: NeutralPreset): ThemeScale {
  const palette = colors[preset] as Record<(typeof shades)[number], string>;
  return Object.fromEntries(shades.map((shade) => [shade, fromHex(palette[shade])])) as ThemeScale;
}

function cssColor(hex: string) {
  return fromHex(hex);
}

export function themeCssVariables(theme: {
  brandColor: string;
  neutralPreset: NeutralPreset;
  accentGold: string;
  radius: "sm" | "md" | "lg" | "xl";
  fontFamily: string;
}) {
  const radius = { sm: "0.375rem", md: "0.5rem", lg: "0.75rem", xl: "1rem" }[theme.radius];
  const font = theme.fontFamily === "system" ? "Arial, sans-serif" : `"${theme.fontFamily}", sans-serif`;
  const variables = [
    ...Object.entries(brandScale(theme.brandColor)).map(([shade, value]) => `--brand-${shade}:${value}`),
    ...Object.entries(neutralScale(theme.neutralPreset)).map(([shade, value]) => `--neutral-${shade}:${value}`),
    `--accent-gold:${cssColor(theme.accentGold)}`,
    `--theme-radius:${radius}`,
    `--font-body:${font}`,
  ];
  return `:root{${variables.join(";")}}`;
}
