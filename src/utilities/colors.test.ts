import { describe, expect, it } from "vitest";
import {
  addRecentColor,
  getColorName,
  isCustomColor,
  isDarkColor,
  isToolColor,
  parseColor,
  readCssColor,
  toHex,
} from "./colors";

describe("colors", () => {
  it("tells palette and custom colors apart", () => {
    expect(isToolColor("--canvas-color-red")).toBe(true);
    expect(isToolColor("#FF8800")).toBe(true);
    expect(isCustomColor("--canvas-color-red")).toBe(false);
    expect(isToolColor("#f80")).toBe(false);
    expect(isToolColor("red")).toBe(false);
  });

  it("names a color", () => {
    expect(getColorName("--canvas-color-red")).toBe("red");
    expect(getColorName("#ff8800")).toBe("#ff8800");
  });

  it("reads and writes hex colors", () => {
    expect(parseColor("#ff8000")).toEqual([255, 128, 0]);
    expect(toHex([255, 128, 0, 255])).toBe("#ff8000");
  });

  it("tells dark colors from light ones", () => {
    expect(isDarkColor("#000000")).toBe(true);
    expect(isDarkColor("#1f2023")).toBe(true);
    expect(isDarkColor("#ffffff")).toBe(false);
    expect(isDarkColor("#fdf6e3")).toBe(false);
    // Navy is dark enough for white on it.
    expect(isDarkColor("#1e3a8a")).toBe(true);
  });

  it("keeps the most recent custom colors first, without repeats", () => {
    let recent = addRecentColor([], "#111111");
    recent = addRecentColor(recent, "#222222");
    recent = addRecentColor(recent, "#111111");

    expect(recent).toEqual(["#111111", "#222222"]);
    for (let index = 0; index < 20; index++) {
      recent = addRecentColor(recent, toHex([index, 0, 0]));
    }
    expect(recent).toHaveLength(8);
    expect(addRecentColor([], "#ABCDEF")).toEqual(["#abcdef"]);
  });

  // Without a browser canvas, only hex can be read. The browser tests cover
  // names and other CSS colors.
  it("reads a typed color as hex, with or without its #", () => {
    expect(readCssColor(" #FF8800 ")).toBe("#ff8800");
    expect(readCssColor("ff8800")).toBe("#ff8800");
    expect(readCssColor("")).toBeNull();
    expect(readCssColor("inherit")).toBeNull();
    expect(readCssColor("nope")).toBeNull();
  });
});
