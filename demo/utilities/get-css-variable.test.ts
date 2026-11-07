import { afterEach, describe, expect, it, vi } from "vitest";
import { getCssVariable } from "./get-css-variable";

describe("getCssVariable", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("returns the trimmed value of a variable", () => {
    document.body.style.setProperty("--color-test", " #123456 ");

    expect(getCssVariable(document.body, "--color-test")).toBe("#123456");
    document.body.style.removeProperty("--color-test");
  });

  it("reads variables inherited from an ancestor", () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    parent.style.setProperty("--color-test", "#123456");
    parent.append(child);
    document.body.append(parent);

    expect(getCssVariable(child, "--color-test")).toBe("#123456");
  });

  it("warns and returns an empty string for a missing variable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(getCssVariable(document.body, "--color-missing")).toBe("");
    expect(warn).toHaveBeenCalledWith(
      "CSS variable --color-missing is not defined."
    );
  });
});
