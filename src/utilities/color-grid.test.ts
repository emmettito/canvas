import { describe, expect, it } from "vitest";
import { getColorGrid } from "./color-grid";

describe("getColorGrid", () => {
  const grid = getColorGrid(
    ["#ff0000", "#0000ff"],
    ["#ffffff", "#cacccd", "#000000"]
  );

  it("has a column of grays, then one for each color", () => {
    expect(grid).toHaveLength(10);
    for (const row of grid) {
      expect(row).toHaveLength(3);
    }
    // White, gray and black are all there, as they are.
    expect(grid[0][0]).toBe("#ffffff");
    expect(grid[5][0]).toBe("#cacccd");
    expect(grid.at(-1)![0]).toBe("#000000");
  });

  it("has each color itself, lighter above and darker below", () => {
    const reds = grid.map((row) => row[1]);
    expect(reds).toContain("#ff0000");
    const index = reds.indexOf("#ff0000");
    const lightness = (hex: string) =>
      [1, 3, 5].reduce(
        (sum, at) => sum + parseInt(hex.slice(at, at + 2), 16),
        0
      );
    expect(lightness(reds[index - 1])).toBeGreaterThan(lightness(reds[index]));
    expect(lightness(reds[index + 1])).toBeLessThan(lightness(reds[index]));
  });
});
