import { describe, expect, it } from "vitest";
import { getColorName } from "./get-color-name";

describe("getColorName", () => {
  it("names a color", () => {
    expect(getColorName("--canvas-color-red")).toBe("Red");
    expect(getColorName("#ff8800")).toBe("#ff8800");
  });
});
