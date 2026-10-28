import { type Box } from "../models/box.model";
import { type Drawing } from "../models/drawing.model";
import { type ImageItem } from "../models/image-item.model";
import { type Note } from "../models/note.model";
import { type Size } from "../models/size.model";
import { type Stroke } from "../models/stroke.model";
import { type TextBox } from "../models/text-box.model";
import {
  type ExportFormat,
  type ExportOptions,
  type ExportScale,
} from "../models/export-options.model";
import { MAX_EXPORT_PIXELS } from "../constants/max-export-pixels.const";
import { NOTE_LAYOUT } from "../constants/note-layout.const";
import { TEXT_LAYOUT } from "../constants/text-layout.const";
import { drawStroke } from "./draw-stroke";
import {
  layOutRichText,
  type PlacedSpan,
  type ResolvedStyle,
  type TextMeasurer,
  toCssFont,
} from "./lay-out-rich-text";

// The default for most browsers, which keeps strokes' edges clean.
const JPEG_QUALITY = 0.92;

export const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  png: "png",
  jpeg: "jpg",
  svg: "svg",
};

// How text looks where it isn't formatted. It comes from the canvas's CSS,
// since the drawing doesn't keep it.
export interface TextStyle {
  // The color of notes' text. Text boxes keep their own.
  noteColor: string;
  fontFamily: string;
}

// Roughly how wide a character is, and how far a font reaches above and below
// its baseline, as multiples of the font size, for when the browser can't
// measure text.
const AVERAGE_CHARACTER_WIDTH = 0.55;
const ASCENT = 0.8;
const DESCENT = 0.2;

// Measures text the way the canvas draws it.
function createMeasurer(): TextMeasurer {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    return {
      width: (text, { size }) => text.length * size * AVERAGE_CHARACTER_WIDTH,
      metrics: ({ size }) => ({
        ascent: size * ASCENT,
        descent: size * DESCENT,
      }),
    };
  }
  const metrics = new Map<string, { ascent: number; descent: number }>();
  const use = (style: ResolvedStyle) => {
    const font = toCssFont(style);
    context.font = font;
    return font;
  };
  return {
    width: (text, style) => {
      use(style);
      return context.measureText(text).width;
    },
    metrics: (style) => {
      const font = use(style);
      let found = metrics.get(font);
      if (!found) {
        const measured = context.measureText("Hg");
        found = {
          ascent: measured.fontBoundingBoxAscent ?? style.size * ASCENT,
          descent: measured.fontBoundingBoxDescent ?? style.size * DESCENT,
        };
        metrics.set(font, found);
      }
      return found;
    },
  };
}

// Moves spans laid out from (0, 0) to `x` and `y` on the drawing.
function moveSpans(spans: PlacedSpan[], x: number, y: number): PlacedSpan[] {
  return spans.map((span) => ({
    ...span,
    x: span.x + x,
    baseline: span.baseline + y,
  }));
}

// A note's text, inside its padding. Lines below its bottom edge are left out.
function layOutNote(
  note: Note,
  { noteColor, fontFamily }: TextStyle,
  measurer: TextMeasurer
): PlacedSpan[] {
  const { padding, fontSize, lineHeight } = NOTE_LAYOUT;
  const { lines } = layOutRichText(
    note.content,
    note.width - padding * 2,
    { fontSize, fontFamily, color: noteColor, lineHeight },
    measurer
  );
  const room = note.height - padding * 2;
  return moveSpans(
    lines.filter(({ bottom }) => bottom <= room).flatMap(({ spans }) => spans),
    note.x + padding,
    note.y + padding
  );
}

// A text box's text, wrapped at its width if it has one.
function layOutTextBox(
  box: TextBox,
  { fontFamily }: TextStyle,
  measurer: TextMeasurer
): PlacedSpan[] {
  const { lines } = layOutRichText(
    box.content,
    box.width,
    {
      fontSize: box.fontSize,
      fontFamily,
      color: box.color,
      lineHeight: TEXT_LAYOUT.lineHeight,
    },
    measurer
  );
  return moveSpans(
    lines.flatMap(({ spans }) => spans),
    box.x,
    box.y
  );
}

// Where an underline or a line through text goes, below or above its
// baseline, and how thick it is, as multiples of the font size.
const UNDERLINE_OFFSET = 0.12;
const STRIKE_OFFSET = -0.3;
const DECORATION_THICKNESS = 1 / 16;

/** The exported image's size in pixels, for a drawing `size` units big. */
export function getExportSize(size: Size, scale: ExportScale): Size {
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/** Whether a PNG or JPEG can be made at this size. SVG has no limit. */
export function canExportAt(size: Size, scale: ExportScale): boolean {
  const { width, height } = getExportSize(size, scale);
  return width * height <= MAX_EXPORT_PIXELS;
}

/**
 * The part of the drawing in `area` as a file, e.g. what the canvas shows.
 * `background` is the canvas color, which shows wherever nothing is drawn
 * unless it's transparent.
 * `images` are the images' files, by id. An image without one is left out.
 * Null if the browser couldn't make the file, e.g. it was too big.
 */
export async function exportDrawing(
  drawing: Drawing,
  area: Box,
  { format, scale, transparent }: ExportOptions,
  background: string,
  textStyle: TextStyle,
  images: Map<string, Blob>
): Promise<Blob | null> {
  // JPEG has no transparency.
  const fill = transparent && format !== "jpeg" ? null : background;
  if (format === "svg") {
    const urls = new Map<string, string>();
    for (const [id, blob] of images) {
      urls.set(id, await readDataUrl(blob));
    }
    const svg = createSvg(drawing, area, scale, fill, textStyle, urls);
    return new Blob([svg], { type: "image/svg+xml" });
  }
  return createImage(drawing, area, scale, fill, textStyle, images, format);
}

// The file as a `data:` URL, so the SVG holds it, byte for byte.
function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// The file as an image element to draw, or null if it can't be read.
async function loadImage(blob: Blob): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Draws text the way the canvas shows it, with its underlines and lines
// through.
function drawSpans(context: CanvasRenderingContext2D, spans: PlacedSpan[]) {
  context.textBaseline = "alphabetic";
  for (const { text, style, x, width, baseline } of spans) {
    context.font = toCssFont(style);
    context.fillStyle = style.color;
    context.fillText(text, x, baseline);
    const thickness = style.size * DECORATION_THICKNESS;
    if (style.underline) {
      context.fillRect(
        x,
        baseline + style.size * UNDERLINE_OFFSET,
        width,
        thickness
      );
    }
    if (style.strike) {
      context.fillRect(
        x,
        baseline + style.size * STRIKE_OFFSET,
        width,
        thickness
      );
    }
  }
}

function drawNote(
  context: CanvasRenderingContext2D,
  note: Note,
  textStyle: TextStyle,
  measurer: TextMeasurer
): void {
  context.fillStyle = note.color;
  context.beginPath();
  context.roundRect(
    note.x,
    note.y,
    note.width,
    note.height,
    NOTE_LAYOUT.cornerRadius
  );
  context.fill();
  drawSpans(context, layOutNote(note, textStyle, measurer));
}

async function createImage(
  { strokes, images, texts, notes }: Drawing,
  area: Box,
  scale: ExportScale,
  fill: string | null,
  textStyle: TextStyle,
  files: Map<string, Blob>,
  format: "png" | "jpeg"
): Promise<Blob | null> {
  const { width, height } = getExportSize(area, scale);
  // Strokes go on their own layer, so the eraser can't erase the background.
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const layerContext = layer.getContext("2d");
  const image = document.createElement("canvas");
  image.width = width;
  image.height = height;
  const context = image.getContext("2d");
  if (!layerContext || !context) {
    return null;
  }
  // The area's top left corner is the image's.
  layerContext.scale(scale, scale);
  layerContext.translate(-area.x, -area.y);
  for (const stroke of strokes) {
    drawStroke(layerContext, stroke);
  }
  if (fill) {
    context.fillStyle = fill;
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(layer, 0, 0);

  // Images, text and notes go on top of everything, the way the canvas
  // shows them.
  context.scale(scale, scale);
  context.translate(-area.x, -area.y);
  for (const item of images) {
    const file = files.get(item.id);
    const element = file && (await loadImage(file));
    if (element) {
      context.drawImage(element, item.x, item.y, item.width, item.height);
    }
  }
  const measurer = createMeasurer();
  for (const box of texts) {
    drawSpans(context, layOutTextBox(box, textStyle, measurer));
  }
  for (const note of notes) {
    drawNote(context, note, textStyle, measurer);
  }
  return new Promise((resolve) =>
    image.toBlob(resolve, `image/${format}`, JPEG_QUALITY)
  );
}

// Two decimal places is far finer than a pixel, and keeps the file small.
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// Colors are values like "#ff0000", but they're escaped in case one isn't.
// Text is escaped the same way.
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

// The stroke as an SVG shape in `color`, drawn the way `drawStroke` draws it.
function createShape({ points, size }: Stroke, color: string): string {
  const paint = escapeAttribute(color);
  if (points.length === 1) {
    const [{ x, y }] = points;
    return `<circle cx="${round(x)}" cy="${round(y)}" r="${round(size)}" fill="${paint}"/>`;
  }
  const path = points
    .map(
      ({ x, y }, index) => `${index === 0 ? "M" : "L"}${round(x)} ${round(y)}`
    )
    .join("");
  return `<path d="${path}" fill="none" stroke="${paint}" stroke-width="${round(size * 2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Text as one `text` element, with a `tspan` for each span in its own place
// and look. Empty if there's no text.
function createText(spans: PlacedSpan[]): string {
  const tspans = spans
    .filter(({ text }) => text !== "")
    .map(({ text, style, x, baseline }) => {
      const decorations = [
        style.underline && "underline",
        style.strike && "line-through",
      ].filter(Boolean);
      return (
        `<tspan x="${round(x)}" y="${round(baseline)}" font-family="${escapeAttribute(style.family)}" font-size="${round(style.size)}"` +
        (style.bold ? ' font-weight="bold"' : "") +
        (style.italic ? ' font-style="italic"' : "") +
        ` fill="${escapeAttribute(style.color)}"` +
        (decorations.length > 0
          ? ` text-decoration="${decorations.join(" ")}"`
          : "") +
        `>${escapeAttribute(text)}</tspan>`
      );
    })
    .join("");
  // `xml:space` keeps runs of spaces, as the canvas does.
  return tspans ? `<text xml:space="preserve">${tspans}</text>` : "";
}

function createImageElement(
  { x, y, width, height }: ImageItem,
  url: string
): string {
  return `<image href="${escapeAttribute(url)}" x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" preserveAspectRatio="none"/>`;
}

// The note as an SVG rectangle, with its text.
function createNote(
  note: Note,
  textStyle: TextStyle,
  measurer: TextMeasurer
): string {
  const rect = `<rect x="${round(note.x)}" y="${round(note.y)}" width="${round(note.width)}" height="${round(note.height)}" rx="${NOTE_LAYOUT.cornerRadius}" fill="${escapeAttribute(note.color)}"/>`;
  return rect + createText(layOutNote(note, textStyle, measurer));
}

/**
 * The part of the drawing in `area` as SVG, `scale` times its size in drawing
 * units, so it opens at the chosen size and stays sharp at any other. The eraser only erases what
 * was drawn before it, so each eraser stroke masks everything before it.
 * Images, text and notes are above every stroke, so no eraser masks them.
 * `imageUrls` are the images' files as `data:` URLs, by id.
 */
export function createSvg(
  { strokes, images, texts, notes }: Drawing,
  area: Box,
  scale: ExportScale,
  fill: string | null,
  textStyle: TextStyle,
  imageUrls: Map<string, string>
): string {
  const x = round(area.x);
  const y = round(area.y);
  const width = round(area.width);
  const height = round(area.height);
  const pixels = getExportSize(area, scale);
  // The area, as SVG attributes.
  const bounds = `x="${x}" y="${y}" width="${width}" height="${height}"`;
  let masks = "";
  let content = "";
  strokes.forEach((stroke, index) => {
    if (stroke.points.length === 0) {
      return;
    }
    if (stroke.color !== undefined) {
      content += createShape(stroke, stroke.color);
      return;
    }
    // White keeps what's under the mask, and the eraser's black hides it.
    const id = `erase-${index}`;
    masks += `<mask id="${id}" maskUnits="userSpaceOnUse" ${bounds}><rect ${bounds} fill="#fff"/>${createShape(stroke, "#000")}</mask>`;
    content = `<g mask="url(#${id})">${content}</g>`;
  });
  for (const item of images) {
    const url = imageUrls.get(item.id);
    if (url) {
      content += createImageElement(item, url);
    }
  }
  if (texts.length > 0 || notes.length > 0) {
    const measurer = createMeasurer();
    for (const box of texts) {
      content += createText(layOutTextBox(box, textStyle, measurer));
    }
    for (const note of notes) {
      content += createNote(note, textStyle, measurer);
    }
  }
  const background = fill
    ? `<rect ${bounds} fill="${escapeAttribute(fill)}"/>`
    : "";
  const defs = masks ? `<defs>${masks}</defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels.width}" height="${pixels.height}" viewBox="${x} ${y} ${width} ${height}">${defs}${background}${content}</svg>`;
}
