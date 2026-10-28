import { describe, expect, it } from "vitest";
import { type Drawing } from "../models/drawing.model";
import { type ExportScale } from "../models/export-options.model";
import { type ImageItem } from "../models/image-item.model";
import { type Note } from "../models/note.model";
import { type Stroke } from "../models/stroke.model";
import { type TextBox } from "../models/text-box.model";
import {
  canExportAt,
  createSvg,
  exportDrawing,
  getExportSize,
} from "./export-drawing";
import { fromPlainText } from "./rich-text";

// The area exported, from the drawing's origin.
const SIZE = { x: 0, y: 0, width: 400, height: 300 };
const DOT: Stroke = { color: "#ff0000", points: [{ x: 10, y: 20 }], size: 5 };
const LINE: Stroke = {
  color: "#0000ff",
  points: [
    { x: 0, y: 0 },
    { x: 10.123, y: 5 },
  ],
  size: 4,
};
// An eraser stroke, which has no color.
const ERASER: Stroke = { points: [{ x: 1, y: 1 }], size: 3 };
const NOTE: Note = {
  id: "a",
  x: 20,
  y: 30,
  width: 160,
  height: 160,
  color: "#fefe99",
  content: fromPlainText("Buy milk"),
};
const TEXT: TextBox = {
  id: "t",
  x: 50,
  y: 60,
  width: null,
  height: null,
  fontSize: 20,
  color: "#0000ff",
  content: fromPlainText("Hello\nworld"),
};
const IMAGE: ImageItem = { id: "i", x: 5, y: 6, width: 100, height: 50 };
const TEXT_STYLE = { noteColor: "#1f2023", fontFamily: "sans-serif" };

// The drawing as SVG, with only what's given in it.
function toSvg(
  drawing: Partial<Drawing>,
  {
    scale = 1,
    fill = null,
    imageUrls = new Map(),
  }: {
    scale?: ExportScale;
    fill?: string | null;
    imageUrls?: Map<string, string>;
  } = {}
): string {
  return createSvg(
    {
      background: "#ffffff",
      strokes: [],
      images: [],
      texts: [],
      notes: [],
      ...drawing,
    },
    SIZE,
    scale,
    fill,
    TEXT_STYLE,
    imageUrls
  );
}

describe("getExportSize", () => {
  it("is the drawing's size times the scale, in whole pixels", () => {
    expect(getExportSize({ width: 100.4, height: 50.6 }, 2)).toEqual({
      width: 201,
      height: 101,
    });
  });
});

describe("canExportAt", () => {
  it("is false once the image is too big for every browser to make", () => {
    expect(canExportAt({ width: 2048, height: 2048 }, 2)).toBe(true);
    expect(canExportAt({ width: 2048, height: 2048 }, 4)).toBe(false);
  });
});

describe("createSvg", () => {
  it("draws dots as circles and lines as round-capped paths", () => {
    const svg = toSvg({ strokes: [DOT, LINE] });

    expect(svg).toContain('<circle cx="10" cy="20" r="5" fill="#ff0000"/>');
    expect(svg).toContain('d="M0 0L10.12 5"');
    expect(svg).toContain('stroke="#0000ff" stroke-width="8"');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it("opens at the chosen size, and keeps the drawing's units inside", () => {
    const svg = toSvg({}, { scale: 2 });

    expect(svg).toContain('width="800" height="600" viewBox="0 0 400 300"');
  });

  it("exports the area it's given, wherever it is on the drawing", () => {
    const svg = createSvg(
      {
        background: "#ffffff",
        strokes: [DOT],
        images: [],
        texts: [],
        notes: [],
      },
      { x: -50, y: 20, width: 100, height: 80 },
      1,
      "#ffffff",
      TEXT_STYLE,
      new Map()
    );

    expect(svg).toContain('width="100" height="80" viewBox="-50 20 100 80"');
    expect(svg).toContain(
      '<rect x="-50" y="20" width="100" height="80" fill="#ffffff"/>'
    );
  });

  it("fills the background unless it's transparent", () => {
    expect(toSvg({}, { fill: "#ffffff" })).toContain(
      '<rect x="0" y="0" width="400" height="300" fill="#ffffff"/>'
    );
    expect(toSvg({})).not.toContain("<rect");
  });

  it("erases only what was drawn before the eraser", () => {
    const svg = toSvg({ strokes: [DOT, ERASER, LINE] }, { fill: "#ffffff" });

    expect(svg).toContain('<mask id="erase-1"');
    // The dot is masked, the line drawn after it isn't, and neither is the
    // background, which shows where the dot was erased.
    expect(svg).toMatch(
      /<rect[^>]*fill="#ffffff"\/><g mask="url\(#erase-1\)"><circle[^>]*\/><\/g><path/
    );
  });

  it("escapes colors, in case one isn't a plain value", () => {
    const svg = toSvg({ strokes: [{ ...DOT, color: '"><script>' }] });

    expect(svg).not.toContain("<script>");
  });
});

describe("createSvg with notes", () => {
  it("draws a note as a rounded rectangle with its text", () => {
    const svg = toSvg({ notes: [NOTE] });

    expect(svg).toContain(
      '<rect x="20" y="30" width="160" height="160" rx="4" fill="#fefe99"/>'
    );
    expect(svg).toMatch(/<tspan [^>]*fill="#1f2023"[^>]*>Buy milk</);
  });

  it("leaves out lines that don't fit in the note", () => {
    const small = {
      ...NOTE,
      height: 48,
      content: fromPlainText("one\ntwo\nthree"),
    };

    const svg = toSvg({ notes: [small] });

    // 48 units, less the padding, fits one line of 16-unit text.
    expect(svg).toContain(">one<");
    expect(svg).not.toContain(">two<");
  });

  it("escapes the text", () => {
    const svg = toSvg({
      notes: [{ ...NOTE, content: fromPlainText("<b>&</b>") }],
    });

    expect(svg).toContain("&lt;b>&amp;&lt;/b>");
  });
});

describe("createSvg with text", () => {
  it("draws each line in the text's color and size", () => {
    const svg = toSvg({ texts: [TEXT] });

    // Lines are 1.25 times the font size apart. Without a canvas to measure
    // with, fonts reach 0.8 of their size above their baseline and 0.2
    // below, so the first baseline is (25 + 16 - 4) / 2 = 18.5 down.
    expect(svg).toContain(
      '<tspan x="50" y="78.5" font-family="sans-serif" font-size="20" fill="#0000ff">Hello</tspan>'
    );
    expect(svg).toContain('y="103.5"');
    expect(svg).toContain(">world</tspan>");
  });

  it("keeps the text's formatting", () => {
    const svg = toSvg({
      texts: [
        {
          ...TEXT,
          content: [
            {
              runs: [
                { text: "big", size: 40, bold: true },
                { text: "fancy", font: "serif", italic: true },
                {
                  text: "marked",
                  underline: true,
                  strike: true,
                  color: "#ff0000",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(svg).toMatch(/font-size="40" font-weight="bold"[^>]*>big</);
    expect(svg).toMatch(
      /font-family="Georgia[^"]*serif"[^>]*font-style="italic"[^>]*>fancy</
    );
    expect(svg).toMatch(
      /fill="#ff0000" text-decoration="underline line-through">marked</
    );
  });

  it("wraps at its width, if it has one", () => {
    // Without a canvas to measure with, a character is 0.55 of the font size
    // wide, so 11 units fits one 20-unit character.
    const svg = toSvg({
      texts: [{ ...TEXT, width: 11, content: fromPlainText("ab") }],
    });

    expect(svg).toContain(">a</tspan>");
    expect(svg).toContain(">b</tspan>");
  });
});

describe("createSvg with images", () => {
  it("embeds each image's file, where it's placed", () => {
    const svg = toSvg(
      { images: [IMAGE] },
      { imageUrls: new Map([["i", "data:image/png;base64,AAAA"]]) }
    );

    expect(svg).toContain(
      '<image href="data:image/png;base64,AAAA" x="5" y="6" width="100" height="50" preserveAspectRatio="none"/>'
    );
  });

  it("leaves out an image without a file", () => {
    expect(toSvg({ images: [IMAGE] })).not.toContain("<image");
  });

  it("puts images, then text, then notes above the strokes and the eraser", () => {
    const svg = toSvg(
      {
        strokes: [DOT, ERASER],
        images: [IMAGE],
        texts: [TEXT],
        notes: [NOTE],
      },
      { imageUrls: new Map([["i", "data:,"]]) }
    );

    expect(svg).toMatch(
      /<\/g><image [^>]*\/><text [^>]*>.*<\/text><rect x="20"/
    );
  });
});

describe("exportDrawing", () => {
  it("makes an SVG file with the images' files in it", async () => {
    const blob = await exportDrawing(
      {
        background: "#ffffff",
        strokes: [DOT],
        images: [IMAGE],
        texts: [],
        notes: [],
      },
      SIZE,
      { format: "svg", scale: 1, transparent: false },
      "#ffffff",
      TEXT_STYLE,
      new Map([["i", new Blob(["png"], { type: "image/png" })]])
    );

    expect(blob?.type).toBe("image/svg+xml");
    const svg = await blob?.text();
    expect(svg).toContain("<circle");
    // "png" in base64.
    expect(svg).toContain('href="data:image/png;base64,cG5n"');
  });
});
