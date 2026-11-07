import { describe, expect, it } from "vitest";
import { resolveColor } from "./resolve-color";

describe("resolveColor", () => {
  it("reads a palette color from the CSS as hex, however it's written", () => {
    const element = document.createElement("div");
    element.style.setProperty("--canvas-color-red", " #FF0000");
    document.body.append(element);

    expect(resolveColor(element, "--canvas-color-red")).toBe("#ff0000");
    // Custom colors are kept as they are.
    expect(resolveColor(element, "#ff8800")).toBe("#ff8800");
    element.remove();
  });
});
