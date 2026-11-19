import { describe, expect, it } from "vitest";
import colors from "tailwindcss/colors";
import { brandScale, neutralScale, themeCssVariables } from "@/lib/theme";

describe("dynamic theme colors", () => {
  it("preserves the existing rose scale and exact 500 color", () => {
    const scale = brandScale("#f43f5e");
    expect(scale[500]).toBe("244 63 94");
    expect(scale[50]).toBe("255 241 242");
    expect(scale[950]).toBe("76 5 25");
    expect(brandScale("#abc")[500]).toBe("170 187 204");
  });

  it("uses the Tailwind neutral palette", () => {
    expect(neutralScale("zinc")[950]).toBe("9 9 11");
    expect(neutralScale("slate")[500]).toBe("100 116 139");
    expect(colors.zinc[950]).toBe("#09090b");
  });

  it("emits CSS variables for colors, radius, and typography", () => {
    const css = themeCssVariables({
      brandColor: "#f43f5e",
      neutralPreset: "zinc",
      accentGold: "#fbbf24",
      radius: "lg",
      fontFamily: "system",
    });
    expect(css).toContain("--brand-500:244 63 94");
    expect(css).toContain("--neutral-950:9 9 11");
    expect(css).toContain("--accent-gold:251 191 36");
    expect(css).toContain("--theme-radius:0.75rem");
    expect(css).toContain("--font-body:Arial, sans-serif");
  });
});
