import { describe, expect, it } from "vitest";
import { formatColor, keepAlpha, readColor } from "./color-formats";

describe("color formats", () => {
  it("writes a color in each format", () => {
    expect(formatColor("#f27637", "hex")).toBe("#F27637");
    expect(formatColor("#f27637", "rgb")).toBe("242, 118, 55");
    expect(formatColor("#f27637", "css")).toBe("rgb(242, 118, 55)");
    expect(formatColor("#f27637", "hsl")).toBe("20°, 88%, 58%");
    expect(formatColor("#f27637", "hsb")).toBe("20°, 77%, 95%");
  });

  it("only writes how see-through it is in CSS", () => {
    expect(formatColor("#f2763780", "hex")).toBe("#F27637");
    expect(formatColor("#f2763780", "css")).toBe("rgba(242, 118, 55, 0.5)");
  });

  // Without a browser canvas, only hex can be read by name. The browser
  // tests cover the rest of CSS.
  it("reads a color typed in each format", () => {
    expect(readColor("#F27637", "hex")).toBe("#f27637");
    expect(readColor("f27637", "hex")).toBe("#f27637");
    expect(readColor("242, 118, 55", "rgb")).toBe("#f27637");
    expect(readColor("rgb 242 118 55", "rgb")).toBe("#f27637");
    expect(readColor("20°, 88%, 58%", "hsl")).toBe("#f27436");
    expect(readColor("20, 77, 95", "hsb")).toBe("#f27638");
    expect(readColor("#f2763780", "css")).toBe("#f2763780");
  });

  it("doesn't read what isn't a color", () => {
    expect(readColor("", "hex")).toBeNull();
    expect(readColor("1, 2", "rgb")).toBeNull();
    expect(readColor("nope", "hsl")).toBeNull();
  });

  it("keeps a color's see-through-ness once another's typed", () => {
    expect(keepAlpha("#000000", "#ffffff80")).toBe("#00000080");
    expect(keepAlpha("#000000", "#ffffff")).toBe("#000000");
  });
});
