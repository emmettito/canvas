import { describe, expect, it } from "vitest";
import { COLORS } from "../constants/colors.const";
import { getNoteShade, getPaletteGrid } from "./palette-grid";

describe("palette grid", () => {
  it("has every note's shade of the palette, so it can be picked there", () => {
    const element = document.createElement("div");
    COLORS.forEach((color, index) =>
      element.style.setProperty(
        color,
        `#${(index * 16 + 15).toString(16).padStart(2, "0")}4080`
      )
    );
    document.body.append(element);

    const cells = getPaletteGrid(element).flat();
    for (const color of COLORS) {
      expect(cells).toContain(getNoteShade(element, color));
    }
    element.remove();
  });
});
