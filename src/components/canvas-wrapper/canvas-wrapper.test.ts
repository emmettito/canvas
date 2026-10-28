import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountCanvas } from "./canvas-wrapper";

describe("mountCanvas", () => {
  beforeEach(() => {
    // jsdom has no ResizeObserver.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("adds the canvas to the container and removes it on unmount", () => {
    const container = document.createElement("div");

    const canvas = mountCanvas(container);
    expect(container.querySelector(".canvas-root")).not.toBeNull();

    canvas.unmount();
    expect(container.children).toHaveLength(0);
  });

  it("throws when the container already has a canvas", () => {
    const container = document.createElement("div");
    mountCanvas(container);

    expect(() => mountCanvas(container)).toThrow(
      "This container already has a canvas."
    );
  });

  it("can mount again after unmounting", () => {
    const container = document.createElement("div");

    mountCanvas(container).unmount();
    mountCanvas(container);

    expect(container.querySelectorAll(".canvas-root")).toHaveLength(1);
  });
});
