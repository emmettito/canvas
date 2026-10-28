import { describe, expect, it } from "vitest";
import { getFileName } from "./get-file-name";

describe("getFileName", () => {
  it("uses the name", () => {
    expect(getFileName("Sunset", "png")).toBe("Sunset.png");
  });

  it("is Untitled without a name, as the canvas is called", () => {
    expect(getFileName("", "png")).toBe("Untitled.png");
    expect(getFileName("   ", "png")).toBe("Untitled.png");
  });

  it("keeps the name's spaces and punctuation", () => {
    expect(getFileName("Sunset, take 2", "svg")).toBe("Sunset, take 2.svg");
  });

  it("replaces characters file names can't have", () => {
    expect(getFileName('a/b\\c:d*e?f"g<h>i|j', "png")).toBe(
      "a-b-c-d-e-f-g-h-i-j.png"
    );
  });
});
