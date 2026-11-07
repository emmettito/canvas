import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalStore } from "./local-store";

const DRAWING = {
  background: "#1f2023",
  strokes: [{ id: "s", color: "#ff0000", points: [{ x: 1, y: 2 }], size: 5 }],
  fills: [],
  erasers: [],
  images: [],
  texts: [],
  notes: [],
  order: [{ kind: "strokes", count: 1 }],
};

const CANVAS = {
  id: "a",
  name: "Sunset",
  updatedAt: 2,
  drawing: DRAWING,
  viewport: { x: 1, y: 2, zoom: 2 },
};

describe("LocalStore", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads back what it saved", async () => {
    await new LocalStore("test").saveCanvas(CANVAS);

    const store = new LocalStore("test");
    expect(await store.loadCanvas("a")).toEqual(CANVAS);
    expect(await store.listCanvases()).toEqual([
      { id: "a", name: "Sunset", updatedAt: 2 },
    ]);
    expect(await store.loadCanvas("b")).toBeNull();
  });

  it("saves each part under its own key, as the library used to", async () => {
    await new LocalStore("test").saveCanvas(CANVAS);

    expect(JSON.parse(localStorage.getItem("test:canvas:a:strokes")!)).toEqual(
      DRAWING.strokes
    );
    expect(JSON.parse(localStorage.getItem("test:canvas:a:viewport")!)).toEqual(
      CANVAS.viewport
    );
  });

  it("lists the most recently changed first", async () => {
    const store = new LocalStore("test");
    await store.saveCanvas(CANVAS);
    await store.saveCanvas({ ...CANVAS, id: "b", name: "", updatedAt: 3 });

    expect((await store.listCanvases()).map(({ id }) => id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("opens a canvas saved before it had a background on white", async () => {
    await new LocalStore("test").saveCanvas(CANVAS);
    localStorage.removeItem("test:canvas:a:background");

    const loaded = await new LocalStore("test").loadCanvas("a");
    expect((loaded!.drawing as { background: string }).background).toBe(
      "#ffffff"
    );
  });

  it("deletes a canvas", async () => {
    const store = new LocalStore("test");
    await store.saveCanvas(CANVAS);

    await store.deleteCanvas("a");

    expect(await store.loadCanvas("a")).toBeNull();
    expect(await store.listCanvases()).toEqual([]);
    expect(localStorage.getItem("test:canvas:a:strokes")).toBeNull();
  });

  it("keeps storage keys apart", async () => {
    await new LocalStore("first").saveCanvas(CANVAS);
    new LocalStore("first").saveSettings({ rulers: true, export: null });

    expect(await new LocalStore("second").loadCanvas("a")).toBeNull();
    expect(new LocalStore("second").loadSettings()).toEqual({ export: null });
  });

  it("keeps the settings and export options apart, as they were", () => {
    const options = { format: "svg", scale: 4, transparent: true };
    new LocalStore("test").saveSettings({ rulers: true, export: options });

    expect(JSON.parse(localStorage.getItem("test:settings")!)).toEqual({
      rulers: true,
    });
    expect(new LocalStore("test").loadSettings()).toEqual({
      rulers: true,
      export: options,
    });
  });

  it("remembers which canvas was open", () => {
    expect(new LocalStore("test").loadOpenCanvas()).toBeUndefined();

    new LocalStore("test").saveOpenCanvas("a");

    expect(new LocalStore("test").loadOpenCanvas()).toBe("a");
  });

  it("rejects, rather than throwing, when storage is full", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(new LocalStore("test").saveCanvas(CANVAS)).rejects.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
