import { afterEach, describe, expect, it, vi } from "vitest";
import { getCssVariable } from "./get-css-variable";

describe("getCssVariable", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--color-test");
    vi.restoreAllMocks();
  });

  it("returns the trimmed value of a variable", () => {
    document.documentElement.style.setProperty("--color-test", " #123456 ");

    expect(getCssVariable("--color-test")).toBe("#123456");
  });

  it("warns and returns an empty string for a missing variable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(getCssVariable("--color-missing")).toBe("");
    expect(warn).toHaveBeenCalledWith(
      "CSS variable --color-missing is not defined."
    );
  });
});
