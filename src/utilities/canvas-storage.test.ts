import { afterEach, describe, expect, it, vi } from "vitest";
import { type CanvasEntry } from "../models/canvas-entry.model";
import { type ImageItem } from "../models/image-item.model";
import { type Note } from "../models/note.model";
import { type Stroke } from "../models/stroke.model";
import { type TextBox } from "../models/text-box.model";
import { type ToolSettings } from "../models/tool-settings.model";
import { CanvasStorage } from "./canvas-storage";

const SETTINGS: ToolSettings = {
  activeTool: "eraser",
  tools: {
    eraser: { color: undefined, size: 20 },
    pencil: { color: "--canvas-color-red", size: 10 },
    highlighter: { color: "#ffee00", size: 20 },
  },
  noteColor: "#ff8800",
  textSize: 32,
  recentColors: ["#ff8800", "#123456"],
  rulers: true,
};

const STROKES: Stroke[] = [
  { color: "#ff0000", points: [{ x: 1, y: 2 }], size: 5 },
  // A pen's, and the highlighter's.
  { color: "#00ff00", points: [{ x: 1, y: 2, pressure: 0.3 }], size: 5 },
  { color: "#ffee00", points: [{ x: 1, y: 2 }], size: 5, opacity: 0.4 },
  // An eraser stroke, which has no color.
  { points: [{ x: 3, y: 4 }], size: 5 },
];

const NOTES: Note[] = [
  {
    id: "n",
    x: 10,
    y: 20,
    width: 160,
    height: 120,
    color: "#fefe99",
    content: [{ runs: [{ text: "Hello", bold: true }] }],
    strokes: [{ color: "#0000ff", points: [{ x: 4, y: 5 }], size: 2 }],
    fills: [{ color: "#00ff00", rings: [[{ x: 0, y: 0 }]], after: 1 }],
  },
];

const TEXTS: TextBox[] = [
  {
    id: "t",
    x: 1,
    y: 2,
    width: null,
    height: null,
    fontSize: 24,
    color: "#000000",
    content: [
      { align: "center", runs: [{ text: "Hi", font: "serif", size: 30 }] },
    ],
  },
  {
    id: "u",
    x: 1,
    y: 2,
    width: 80,
    height: 50,
    fontSize: 12,
    color: "#ff0000",
    content: [{ runs: [] }],
  },
];

const IMAGES: ImageItem[] = [{ id: "i", x: 5, y: 6, width: 300, height: 200 }];

const CANVASES: CanvasEntry[] = [
  { id: "a", name: "Sunset", updatedAt: 2 },
  { id: "b", name: "", updatedAt: 1 },
];

describe("CanvasStorage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("restores what it saved", () => {
    const storage = new CanvasStorage("test");

    expect(storage.saveToolSettings(SETTINGS)).toBe(true);
    expect(storage.saveCanvases(CANVASES)).toBe(true);
    expect(storage.saveStrokes("a", STROKES)).toBe(true);
    expect(storage.saveItems("a", "notes", NOTES)).toBe(true);
    expect(storage.saveItems("a", "texts", TEXTS)).toBe(true);
    expect(storage.saveItems("a", "images", IMAGES)).toBe(true);

    const restored = new CanvasStorage("test");
    expect(restored.loadToolSettings()).toEqual(SETTINGS);
    expect(restored.loadCanvases()).toEqual(CANVASES);
    expect(restored.loadStrokes("a")).toEqual(STROKES);
    expect(restored.loadItems("a", "notes")).toEqual(NOTES);
    expect(restored.loadItems("a", "texts")).toEqual(TEXTS);
    expect(restored.loadItems("a", "images")).toEqual(IMAGES);
  });

  it("ignores strokes pressed harder than a pen can", () => {
    localStorage.setItem(
      "test:canvas:a:strokes",
      JSON.stringify([{ ...STROKES[0], points: [{ x: 0, y: 0, pressure: 2 }] }])
    );

    expect(new CanvasStorage("test").loadStrokes("a")).toBeNull();
  });

  it("restores which canvas was open", () => {
    new CanvasStorage("test").saveOpenCanvas("a");
    expect(new CanvasStorage("test").loadOpenCanvas()).toBe("a");

    // A blank canvas was open.
    new CanvasStorage("test").saveOpenCanvas(null);
    expect(new CanvasStorage("test").loadOpenCanvas()).toBeNull();
  });

  it("restores nothing when nothing was saved", () => {
    const storage = new CanvasStorage("test");

    expect(storage.loadToolSettings()).toBeNull();
    expect(storage.loadOpenCanvas()).toBeNull();
    expect(storage.loadCanvases()).toEqual([]);
    expect(storage.loadStrokes("a")).toBeNull();
    expect(storage.loadItems("a", "notes")).toBeNull();
  });

  it("keeps each canvas's drawing apart", () => {
    const storage = new CanvasStorage("test");

    storage.saveStrokes("a", STROKES);

    expect(storage.loadStrokes("b")).toBeNull();
  });

  it("deletes a canvas's drawing", () => {
    const storage = new CanvasStorage("test");
    storage.saveStrokes("a", STROKES);
    storage.saveItems("a", "notes", NOTES);
    storage.saveItems("a", "texts", TEXTS);
    storage.saveItems("a", "images", IMAGES);

    storage.deleteCanvas("a");

    expect(storage.loadStrokes("a")).toBeNull();
    expect(storage.loadItems("a", "notes")).toBeNull();
    expect(storage.loadItems("a", "texts")).toBeNull();
    expect(storage.loadItems("a", "images")).toBeNull();
  });

  it("restores each canvas's stacking order, and deletes it", () => {
    const storage = new CanvasStorage("test");
    const order = [
      { kind: "strokes", count: 2 },
      { kind: "notes", id: "n" },
    ] as const;

    storage.saveOrder("a", [...order]);
    expect(new CanvasStorage("test").loadOrder("a")).toEqual(order);

    storage.deleteCanvas("a");
    expect(storage.loadOrder("a")).toBeNull();
  });

  it("ignores an order that isn't one", () => {
    const storage = new CanvasStorage("test");
    for (const order of [
      [{ kind: "strokes", count: 0 }],
      [{ kind: "strokes", count: 1.5 }],
      [{ kind: "shapes", id: "s" }],
      { kind: "strokes", count: 1 },
    ]) {
      localStorage.setItem("test:canvas:a:order", JSON.stringify(order));
      expect(storage.loadOrder("a")).toBeNull();
    }
  });

  it("restores each canvas's fills, ignores ones that aren't, and deletes them", () => {
    const storage = new CanvasStorage("test");
    const fills = [
      {
        color: "#ff0000",
        rings: [
          [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
        ],
        after: 2,
      },
    ];

    storage.saveFills("a", fills);
    expect(new CanvasStorage("test").loadFills("a")).toEqual(fills);

    localStorage.setItem(
      "test:canvas:b:fills",
      JSON.stringify([{ ...fills[0], after: -1 }])
    );
    expect(storage.loadFills("b")).toBeNull();

    storage.deleteCanvas("a");
    expect(storage.loadFills("a")).toBeNull();
  });

  it("keeps storage keys apart", () => {
    new CanvasStorage("first").saveToolSettings(SETTINGS);

    expect(new CanvasStorage("second").loadToolSettings()).toBeNull();
  });

  it("keeps everything in memory without a key", () => {
    const storage = new CanvasStorage();

    storage.saveStrokes("a", STROKES);

    expect(storage.loadStrokes("a")).toEqual(STROKES);
    expect(localStorage).toHaveLength(0);
    // A second canvas on the page doesn't see it.
    expect(new CanvasStorage().loadStrokes("a")).toBeNull();
  });

  it("ignores saved data that isn't valid", () => {
    localStorage.setItem("test:canvas:a:strokes", "not JSON");
    localStorage.setItem(
      "test:canvas:a:notes",
      JSON.stringify([{ ...NOTES[0], width: -1 }])
    );
    localStorage.setItem(
      "test:canvas:a:texts",
      JSON.stringify([{ ...TEXTS[0], fontSize: "big" }])
    );
    localStorage.setItem(
      "test:canvas:a:images",
      JSON.stringify([{ ...IMAGES[0], id: 1 }])
    );
    const storage = new CanvasStorage("test");

    expect(storage.loadStrokes("a")).toBeNull();
    expect(storage.loadItems("a", "notes")).toBeNull();
    expect(storage.loadItems("a", "texts")).toBeNull();
    expect(storage.loadItems("a", "images")).toBeNull();
  });

  it("leaves out canvases in the history that aren't valid", () => {
    localStorage.setItem(
      "test:canvases",
      JSON.stringify([CANVASES[0], { id: "c" }])
    );

    expect(new CanvasStorage("test").loadCanvases()).toEqual([CANVASES[0]]);
  });

  it("ignores a pencil color that's neither the palette's nor hex", () => {
    localStorage.setItem(
      "test:settings",
      JSON.stringify({
        ...SETTINGS,
        tools: { ...SETTINGS.tools, pencil: { color: "tomato", size: 10 } },
      })
    );

    expect(new CanvasStorage("test").loadToolSettings()).toBeNull();
  });

  it("warns instead of throwing when storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    let saved = true;
    expect(() => {
      saved = new CanvasStorage("test").saveStrokes("a", []);
    }).not.toThrow();
    // So the canvas can say it couldn't save.
    expect(saved).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe("CanvasStorage export options", () => {
  afterEach(() => localStorage.clear());

  it("restores the options last exported with", () => {
    const options = { format: "svg", scale: 4, transparent: true } as const;
    new CanvasStorage("test").saveExportOptions(options);

    expect(new CanvasStorage("test").loadExportOptions()).toEqual(options);
  });

  it("ignores options it can't use", () => {
    localStorage.setItem(
      "test:export",
      JSON.stringify({ format: "gif", scale: 3, transparent: "yes" })
    );

    expect(new CanvasStorage("test").loadExportOptions()).toBeNull();
  });

  it("gives settings saved before notes and text their defaults", () => {
    const {
      noteColor: _,
      textSize: __,
      recentColors: ___,
      rulers: ____,
      ...older
    } = SETTINGS;
    localStorage.setItem("test:settings", JSON.stringify(older));

    expect(new CanvasStorage("test").loadToolSettings()).toEqual({
      ...older,
      noteColor: "--canvas-color-yellow",
      textSize: 24,
      recentColors: [],
      rulers: false,
    });
  });

  it("gives settings saved before the highlighter its defaults", () => {
    const { highlighter: _, ...tools } = SETTINGS.tools;
    localStorage.setItem(
      "test:settings",
      JSON.stringify({ ...SETTINGS, tools })
    );

    expect(new CanvasStorage("test").loadToolSettings()?.tools).toEqual({
      ...tools,
      highlighter: { color: "--canvas-color-yellow", size: 10 },
    });
  });

  it("turns plain text saved before formatting into paragraphs", () => {
    // Saved before notes could be drawn on, too.
    const { content: _, strokes: ____, fills: _____, ...note } = NOTES[0];
    const { content: __, height: ___, ...text } = TEXTS[0];
    localStorage.setItem(
      "test:canvas:a:notes",
      JSON.stringify([{ ...note, text: "one\ntwo" }])
    );
    localStorage.setItem(
      "test:canvas:a:texts",
      JSON.stringify([{ ...text, text: "Hi" }])
    );
    const storage = new CanvasStorage("test");

    expect(storage.loadItems("a", "notes")).toEqual([
      {
        ...note,
        content: [{ runs: [{ text: "one" }] }, { runs: [{ text: "two" }] }],
        strokes: [],
        fills: [],
      },
    ]);
    // Text saved before it could be resized fits its text.
    expect(storage.loadItems("a", "texts")).toEqual([
      { ...text, height: null, content: [{ runs: [{ text: "Hi" }] }] },
    ]);
  });

  it("keeps who signed a note, and leaves out names that aren't any", () => {
    localStorage.setItem(
      "test:canvas:a:notes",
      JSON.stringify([
        { ...NOTES[0], authors: ["Ada", "Grace"] },
        { ...NOTES[0], id: "b", authors: ["", 7, "Ada"] },
        { ...NOTES[0], id: "c", authors: [] },
        { ...NOTES[0], id: "d", authors: "Ada" },
      ])
    );
    const storage = new CanvasStorage("test");

    expect(storage.loadItems("a", "notes")).toEqual([
      { ...NOTES[0], authors: ["Ada", "Grace"] },
      { ...NOTES[0], id: "b", authors: ["Ada"] },
      { ...NOTES[0], id: "c" },
      { ...NOTES[0], id: "d" },
    ]);
  });

  it("keeps who signed a note saved with one author", () => {
    localStorage.setItem(
      "test:canvas:a:notes",
      JSON.stringify([
        { ...NOTES[0], author: "Ada" },
        { ...NOTES[0], id: "b", author: "" },
        { ...NOTES[0], id: "c", author: 7 },
      ])
    );
    const storage = new CanvasStorage("test");

    expect(storage.loadItems("a", "notes")).toEqual([
      { ...NOTES[0], authors: ["Ada"] },
      { ...NOTES[0], id: "b" },
      { ...NOTES[0], id: "c" },
    ]);
  });

  it("ignores formatting it doesn't know", () => {
    localStorage.setItem(
      "test:canvas:a:notes",
      JSON.stringify([
        {
          ...NOTES[0],
          content: [{ runs: [{ text: "a", font: "wingdings" }] }],
        },
      ])
    );

    expect(new CanvasStorage("test").loadItems("a", "notes")).toBeNull();
  });

  it("restores each canvas's viewport, and deletes it with the canvas", () => {
    const storage = new CanvasStorage("test");
    const viewport = { x: -20, y: 40.5, zoom: 2 };

    storage.saveViewport("a", viewport);
    expect(new CanvasStorage("test").loadViewport("a")).toEqual(viewport);
    expect(storage.loadViewport("b")).toBeNull();

    storage.deleteCanvas("a");
    expect(storage.loadViewport("a")).toBeNull();
  });

  it("ignores a viewport zoomed further than the canvas allows", () => {
    localStorage.setItem(
      "test:canvas:a:viewport",
      JSON.stringify({ x: 0, y: 0, zoom: 500 })
    );

    expect(new CanvasStorage("test").loadViewport("a")).toBeNull();
  });

  it("keeps custom colors, and leaves out ones that aren't", () => {
    localStorage.setItem(
      "test:settings",
      JSON.stringify({
        ...SETTINGS,
        tools: {
          ...SETTINGS.tools,
          pencil: { color: "#abcdef", size: 10 },
        },
        recentColors: ["#abcdef", "red", 5],
      })
    );

    const settings = new CanvasStorage("test").loadToolSettings()!;
    expect(settings.tools.pencil.color).toBe("#abcdef");
    expect(settings.recentColors).toEqual(["#abcdef"]);
  });

  it("doesn't reopen with the dropper, which is only picked for a moment", () => {
    localStorage.setItem(
      "test:settings",
      JSON.stringify({ ...SETTINGS, activeTool: "dropper" })
    );

    expect(new CanvasStorage("test").loadToolSettings()?.activeTool).toBe(
      "pencil"
    );
  });

  it("restores each canvas's background, and deletes it with the canvas", () => {
    const storage = new CanvasStorage("test");

    storage.saveBackground("a", "#1f2023");
    expect(new CanvasStorage("test").loadBackground("a")).toBe("#1f2023");
    expect(storage.loadBackground("b")).toBeNull();

    storage.deleteCanvas("a");
    expect(storage.loadBackground("a")).toBeNull();
  });

  it("ignores a background that isn't a color", () => {
    localStorage.setItem(
      "test:canvas:a:background",
      JSON.stringify("url(evil.png)")
    );

    expect(new CanvasStorage("test").loadBackground("a")).toBeNull();
  });
});
