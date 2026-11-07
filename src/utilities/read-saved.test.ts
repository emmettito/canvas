import { describe, expect, it } from "vitest";
import { type CanvasEntry } from "../models/canvas-entry.model";
import { type ImageItem } from "../models/image-item.model";
import { type Note } from "../models/note.model";
import { type Stroke } from "../models/stroke.model";
import { type TextBox } from "../models/text-box.model";
import { type ToolSettings } from "../models/tool-settings.model";
import {
  readDrawing,
  readEntries,
  readExportOptions,
  readToolSettings,
  readViewport,
  type SettingsPalette,
} from "./read-saved";

// A page's palette, by the names it gives its colors.
const PALETTE: SettingsPalette = {
  colors: ["red", "blue", "yellow", "lime"],
  highlighter: "lime",
  note: "yellow",
};

const SETTINGS: ToolSettings = {
  activeTool: "eraser",
  tools: {
    eraser: { color: undefined, size: 20 },
    pencil: { color: "red", size: 10 },
    highlighter: { color: "#ffee00", size: 20 },
  },
  bucketColor: "blue",
  noteColor: "#ff8800",
  textSize: 32,
  recentColors: ["#ff8800", "#123456"],
  colorFormats: {
    pencil: "hsl",
    highlighter: "rgb",
    bucket: "hsb",
    note: "hex",
    text: "css",
  },
  rulers: true,
};

const STROKES: Stroke[] = [
  { id: "s5", color: "#ff0000", points: [{ x: 1, y: 2 }], size: 5 },
  // A pen's, and the highlighter's.
  {
    id: "s4",
    color: "#00ff00",
    points: [{ x: 1, y: 2, pressure: 0.3 }],
    size: 5,
  },
  {
    id: "s3",
    color: "#ffee00",
    points: [{ x: 1, y: 2 }],
    size: 5,
    opacity: 0.4,
    cap: "square",
  },
  // An eraser stroke, which has no color.
  { id: "s2", points: [{ x: 3, y: 4 }], size: 5 },
];

const NOTES: Note[] = [
  {
    erasers: [],
    id: "n",
    x: 10,
    y: 20,
    width: 160,
    height: 120,
    color: "#fefe99",
    content: [{ runs: [{ text: "Hello", bold: true }] }],
    strokes: [
      { id: "s1", color: "#0000ff", points: [{ x: 4, y: 5 }], size: 2 },
    ],
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

// What's read back, through JSON, as a page's store gives it.
const roundTrip = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value));

describe("readDrawing", () => {
  it("reads back what was saved", () => {
    const drawing = readDrawing(
      roundTrip({
        strokes: STROKES,
        notes: NOTES,
        texts: TEXTS,
        images: IMAGES,
        fills: [],
        erasers: [],
        background: "#1f2023",
        order: [{ kind: "strokes", count: 4 }],
      })
    );

    expect(drawing).toEqual({
      strokes: STROKES,
      notes: NOTES,
      texts: TEXTS,
      images: IMAGES,
      fills: [],
      erasers: [],
      background: "#1f2023",
      order: [{ kind: "strokes", count: 4 }],
    });
  });

  it("reads nothing when nothing was saved", () => {
    for (const value of [null, undefined, "drawing", {}]) {
      expect(readDrawing(value)).toEqual({
        strokes: null,
        fills: null,
        erasers: null,
        images: null,
        texts: null,
        notes: null,
        order: null,
        background: null,
      });
    }
  });

  it("ignores strokes pressed harder than a pen can", () => {
    const strokes = [{ ...STROKES[0], points: [{ x: 0, y: 0, pressure: 2 }] }];

    expect(readDrawing({ strokes }).strokes).toBeNull();
  });

  it("stacks the rest of an order with shapes in it as it was", () => {
    const order = [
      { kind: "strokes", count: 1 },
      { kind: "shapes", id: "s" },
      { kind: "strokes", count: 2 },
      { kind: "notes", id: "n" },
    ];

    expect(readDrawing({ order }).order).toEqual([
      { kind: "strokes", count: 3 },
      { kind: "notes", id: "n" },
    ]);
  });

  it("ignores an order that isn't one", () => {
    for (const order of [
      [{ kind: "strokes", count: 0 }],
      [{ kind: "strokes", count: 1.5 }],
      [{ kind: "videos", id: "v" }],
      { kind: "strokes", count: 1 },
    ]) {
      expect(readDrawing({ order }).order).toBeNull();
    }
  });

  it("reads fills, and ignores ones that aren't", () => {
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

    expect(readDrawing(roundTrip({ fills })).fills).toEqual(fills);
    expect(
      readDrawing({ fills: [{ ...fills[0], after: -1 }] }).fills
    ).toBeNull();
  });

  it("ignores parts that aren't valid, keeping the rest", () => {
    const drawing = readDrawing({
      strokes: "not strokes",
      notes: [{ ...NOTES[0], width: -1 }],
      texts: [{ ...TEXTS[0], fontSize: "big" }],
      images: [{ ...IMAGES[0], id: 1 }],
      fills: [],
    });

    expect(drawing.strokes).toBeNull();
    expect(drawing.notes).toBeNull();
    expect(drawing.texts).toBeNull();
    expect(drawing.images).toBeNull();
    expect(drawing.fills).toEqual([]);
  });

  it("turns plain text saved before formatting into paragraphs", () => {
    // Saved before notes could be drawn on, too.
    const { content: _, strokes: ____, fills: _____, ...note } = NOTES[0];
    const { content: __, height: ___, ...text } = TEXTS[0];
    const drawing = readDrawing({
      notes: [{ ...note, text: "one\ntwo" }],
      texts: [{ ...text, text: "Hi" }],
    });

    expect(drawing.notes).toEqual([
      {
        ...note,
        content: [{ runs: [{ text: "one" }] }, { runs: [{ text: "two" }] }],
        strokes: [],
        fills: [],
      },
    ]);
    // Text saved before it could be resized fits its text.
    expect(drawing.texts).toEqual([
      { ...text, height: null, content: [{ runs: [{ text: "Hi" }] }] },
    ]);
  });

  it("keeps who signed a note, and leaves out names that aren't any", () => {
    const ada = { firstName: "Ada", lastName: "Lovelace" };
    const grace = { firstName: "Grace", lastName: "" };
    const notes = [
      { ...NOTES[0], authors: [ada, grace] },
      {
        ...NOTES[0],
        id: "b",
        authors: [{ firstName: "", lastName: "" }, { firstName: 7 }, 7, ada],
      },
      { ...NOTES[0], id: "c", authors: [] },
      { ...NOTES[0], id: "d", authors: ada },
    ];

    expect(readDrawing(roundTrip({ notes })).notes).toEqual([
      { ...NOTES[0], authors: [ada, grace] },
      { ...NOTES[0], id: "b", authors: [ada] },
      { ...NOTES[0], id: "c" },
      { ...NOTES[0], id: "d" },
    ]);
  });

  it("keeps who signed a note saved with one author", () => {
    const notes = [
      { ...NOTES[0], author: "Ada" },
      { ...NOTES[0], id: "b", author: "" },
      { ...NOTES[0], id: "c", author: 7 },
    ];

    expect(readDrawing(roundTrip({ notes })).notes).toEqual([
      { ...NOTES[0], authors: [{ firstName: "Ada", lastName: "" }] },
      { ...NOTES[0], id: "b" },
      { ...NOTES[0], id: "c" },
    ]);
  });

  it("splits whole names, saved before first and last names were apart", () => {
    const notes = [{ ...NOTES[0], authors: ["Ada Lovelace", "", "Grace"] }];

    expect(readDrawing(roundTrip({ notes })).notes).toEqual([
      {
        ...NOTES[0],
        authors: [
          { firstName: "Ada", lastName: "Lovelace" },
          { firstName: "Grace", lastName: "" },
        ],
      },
    ]);
  });

  it("ignores formatting it doesn't know", () => {
    const notes = [
      { ...NOTES[0], content: [{ runs: [{ text: "a", font: "wingdings" }] }] },
    ];

    expect(readDrawing({ notes }).notes).toBeNull();
  });

  it("ignores a background that isn't a color", () => {
    expect(readDrawing({ background: "url(evil.png)" }).background).toBeNull();
  });
});

describe("readEntries", () => {
  it("reads the canvases, leaving out ones that aren't valid", () => {
    expect(readEntries(roundTrip(CANVASES))).toEqual(CANVASES);
    expect(readEntries([CANVASES[0], { id: "c" }])).toEqual([CANVASES[0]]);
    expect(readEntries(null)).toEqual([]);
  });
});

describe("readViewport", () => {
  it("reads a viewport", () => {
    const viewport = { x: -20, y: 40.5, zoom: 2 };

    expect(readViewport(roundTrip(viewport))).toEqual(viewport);
    expect(readViewport(null)).toBeNull();
  });

  it("ignores a viewport zoomed further than the canvas allows", () => {
    expect(readViewport({ x: 0, y: 0, zoom: 500 })).toBeNull();
  });
});

describe("readExportOptions", () => {
  it("reads the options last exported with", () => {
    const options = { format: "svg", scale: 4, transparent: true } as const;

    expect(readExportOptions(roundTrip(options))).toEqual(options);
  });

  it("ignores options it can't use", () => {
    expect(
      readExportOptions({ format: "gif", scale: 3, transparent: "yes" })
    ).toBeNull();
  });
});

describe("readToolSettings", () => {
  it("reads back what was saved", () => {
    expect(readToolSettings(roundTrip(SETTINGS), PALETTE)).toEqual(SETTINGS);
    expect(readToolSettings(null, PALETTE)).toBeNull();
  });

  it("ignores a pencil color that's neither the palette's nor hex", () => {
    const settings = {
      ...SETTINGS,
      tools: { ...SETTINGS.tools, pencil: { color: "tomato", size: 10 } },
    };

    expect(readToolSettings(settings, PALETTE)).toBeNull();
  });

  it("gives settings saved before notes and text their defaults", () => {
    const {
      noteColor: _,
      textSize: __,
      recentColors: ___,
      rulers: ____,
      ...older
    } = SETTINGS;

    expect(readToolSettings(roundTrip(older), PALETTE)).toEqual({
      ...older,
      noteColor: "yellow",
      textSize: 24,
      recentColors: [],
      rulers: false,
    });
  });

  it("gives settings saved before the highlighter its defaults", () => {
    const { highlighter: _, ...tools } = SETTINGS.tools;

    expect(
      readToolSettings(roundTrip({ ...SETTINGS, tools }), PALETTE)?.tools
    ).toEqual({
      ...tools,
      highlighter: { color: "lime", size: 10 },
    });
  });

  it("keeps custom colors, and leaves out ones that aren't", () => {
    const settings = readToolSettings(
      {
        ...SETTINGS,
        tools: { ...SETTINGS.tools, pencil: { color: "#abcdef", size: 10 } },
        recentColors: ["#abcdef", "red", 5],
      },
      PALETTE
    )!;

    expect(settings.tools.pencil.color).toBe("#abcdef");
    expect(settings.recentColors).toEqual(["#abcdef"]);
  });

  it("doesn't reopen with the dropper, which is only picked for a moment", () => {
    expect(
      readToolSettings({ ...SETTINGS, activeTool: "dropper" }, PALETTE)
        ?.activeTool
    ).toBe("pencil");
  });

  it("reopens a tool that's been removed, e.g. the shape tool, as the pencil", () => {
    expect(
      readToolSettings(
        roundTrip({ ...SETTINGS, activeTool: "shape", shapeType: "arrow" }),
        PALETTE
      )
    ).toEqual({ ...SETTINGS, activeTool: "pencil" });
  });
});
