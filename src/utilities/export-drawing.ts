import { type Box } from "../models/box.model";
import { type Drawing } from "../models/drawing.model";
import { type Fill } from "../models/fill.model";
import { type ImageItem } from "../models/image-item.model";
import { type Note } from "../models/note.model";
import { type Shape } from "../models/shape.model";
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
import { drawFills, getFillSteps } from "./draw-fills";
import { drawStroke } from "./draw-stroke";
import { getByline } from "./get-byline";
import { resolveLayers } from "./layers";
import { getShapePath } from "./shape-geometry";
import { addPngText } from "./png-text";
import {
  getDotSize,
  getStrokePieces,
  hasPressure,
  type StrokePiece,
} from "./stroke-pieces";
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
  const room = note.height - padding * 2 - getBylineHeight(note);
  return moveSpans(
    lines.filter(({ bottom }) => bottom <= room).flatMap(({ spans }) => spans),
    note.x + padding,
    note.y + padding
  );
}

// How much room a note's byline takes from its text.
function getBylineHeight(note: Note): number {
  const { bylineSize, lineHeight } = NOTE_LAYOUT;
  return note.authors?.length ? bylineSize * lineHeight : 0;
}

// `text`, cut short with an ellipsis if it's wider than `room`, as CSS's
// `text-overflow: ellipsis` does.
function fitText(
  text: string,
  room: number,
  style: ResolvedStyle,
  measurer: TextMeasurer
): string {
  if (measurer.width(text, style) <= room) {
    return text;
  }
  const characters = [...text];
  while (
    characters.length > 0 &&
    measurer.width(`${characters.join("")}…`, style) > room
  ) {
    characters.pop();
  }
  return `${characters.join("")}…`;
}

// Who signed a note, on one line along its bottom, inside its padding. Null
// if nobody did.
function layOutByline(
  note: Note,
  { noteColor, fontFamily }: TextStyle,
  measurer: TextMeasurer
): PlacedSpan | null {
  const byline = getByline(note);
  if (!byline) {
    return null;
  }
  const { padding, bylineSize } = NOTE_LAYOUT;
  const style: ResolvedStyle = {
    size: bylineSize,
    family: fontFamily,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: noteColor,
  };
  const text = fitText(byline, note.width - padding * 2, style, measurer);
  const { ascent, descent } = measurer.metrics(style);
  // Centered in its line box, the way CSS places a line's text.
  const lineBox = getBylineHeight(note);
  const top = note.y + note.height - padding - lineBox;
  return {
    text,
    style,
    x: note.x + padding,
    width: measurer.width(text, style),
    baseline: top + (lineBox + ascent - descent) / 2,
  };
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
export function getExportSize(size: Size, scale: number): Size {
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
  images: Map<string, Blob>,
  author = ""
): Promise<Blob | null> {
  // JPEG has no transparency.
  const fill = transparent && format !== "jpeg" ? null : background;
  if (format === "svg") {
    const urls = new Map<string, string>();
    for (const [id, blob] of images) {
      urls.set(id, await readDataUrl(blob));
    }
    const svg = createSvg(drawing, area, scale, fill, textStyle, urls, author);
    return new Blob([svg], { type: "image/svg+xml" });
  }
  const elements = new Map<string, CanvasImageSource>();
  for (const [id, blob] of images) {
    const element = await loadImage(blob);
    if (element) {
      elements.set(id, element);
    }
  }
  const image = await renderDrawing(
    drawing,
    area,
    scale,
    fill,
    textStyle,
    elements
  );
  if (!image) {
    return null;
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    image.toBlob(resolve, `image/${format}`, JPEG_QUALITY)
  );
  // JPEG keeps who made it in EXIF, which is more than it's worth here.
  return blob && author && format === "png"
    ? addPngText(blob, "Author", author)
    : blob;
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

// A canvas as big as `context`'s, drawn on through the same transform, so
// strokes on it can be erased without erasing what's under them.
function createLayer(
  context: CanvasRenderingContext2D
): CanvasRenderingContext2D | null {
  const layer = document.createElement("canvas");
  layer.width = context.canvas.width;
  layer.height = context.canvas.height;
  const layerContext = layer.getContext("2d");
  layerContext?.setTransform(context.getTransform());
  return layerContext;
}

// Draws strokes on their own layer, then onto `context`, so erasers only
// erase them. `erasers` are drawn after them, e.g. ones drawn above them.
function drawStrokes(
  context: CanvasRenderingContext2D,
  strokes: Stroke[],
  erasers: Stroke[] = []
): void {
  if (!strokes.some((stroke) => stroke.color !== undefined)) {
    return;
  }
  const layer = createLayer(context);
  if (!layer) {
    return;
  }
  for (const stroke of [...strokes, ...erasers]) {
    drawStroke(layer, stroke);
  }
  context.save();
  context.resetTransform();
  context.drawImage(layer.canvas, 0, 0);
  context.restore();
}

// Draws fills on their own layer, then onto `context`, so erasers only erase
// them. `strokes` are the strokes they count from.
function drawFillLayer(
  context: CanvasRenderingContext2D,
  fills: Fill[],
  strokes: Stroke[]
): void {
  if (fills.length === 0) {
    return;
  }
  const layer = createLayer(context);
  if (!layer) {
    return;
  }
  drawFills(layer, fills, strokes);
  context.save();
  context.resetTransform();
  context.drawImage(layer.canvas, 0, 0);
  context.restore();
}

// The note, its fills, its text, and the strokes drawn on it. Its fills and
// strokes only show inside it.
function drawNote(
  context: CanvasRenderingContext2D,
  note: Note,
  textStyle: TextStyle,
  measurer: TextMeasurer
): void {
  const shape = new Path2D();
  shape.roundRect(
    note.x,
    note.y,
    note.width,
    note.height,
    NOTE_LAYOUT.cornerRadius
  );
  context.fillStyle = note.color;
  context.fill(shape);
  context.save();
  context.clip(shape);
  context.translate(note.x, note.y);
  drawFillLayer(context, note.fills, note.strokes);
  context.restore();
  drawSpans(context, layOutNote(note, textStyle, measurer));
  const byline = layOutByline(note, textStyle, measurer);
  if (byline) {
    context.save();
    context.globalAlpha = NOTE_LAYOUT.bylineOpacity;
    drawSpans(context, [byline]);
    context.restore();
  }
  context.save();
  context.clip(shape);
  context.translate(note.x, note.y);
  drawStrokes(context, note.strokes);
  context.restore();
}

// A shape's inside, if it's filled, then its outline or line over it.
function drawShape(context: CanvasRenderingContext2D, shape: Shape): void {
  const path = new Path2D(getShapePath(shape));
  context.save();
  context.globalCompositeOperation = "source-over";
  if (shape.fill !== null) {
    context.fillStyle = shape.fill;
    context.fill(path);
  }
  context.strokeStyle = shape.color;
  context.lineWidth = shape.strokeWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke(path);
  context.restore();
}

/**
 * Draws the part of the drawing in `area` onto a new canvas, `scale` pixels
 * per drawing unit, as exports do, e.g. to read a color from it. `fill` is
 * the background, or null for none. `images` are the images, decoded, by id,
 * so drawing often doesn't decode them each time. An image without one is
 * left out. Null if the browser can't draw it.
 */
export function renderDrawing(
  drawing: Drawing,
  area: Box,
  scale: number,
  fill: string | null,
  textStyle: TextStyle,
  images: Map<string, CanvasImageSource>
): HTMLCanvasElement | null {
  const { width, height } = getExportSize(area, scale);
  const image = document.createElement("canvas");
  image.width = width;
  image.height = height;
  const context = image.getContext("2d");
  if (!context) {
    return null;
  }
  if (fill) {
    context.fillStyle = fill;
    context.fillRect(0, 0, width, height);
  }
  // The area's top left corner is the image's.
  context.scale(scale, scale);
  context.translate(-area.x, -area.y);
  const measurer = createMeasurer();
  // Fills are below everything else.
  drawFillLayer(context, drawing.fills, drawing.strokes);
  // Bottom to top, the way the canvas shows them.
  for (const layer of resolveLayers(drawing)) {
    switch (layer.kind) {
      case "strokes":
        drawStrokes(
          context,
          layer.strokes,
          layer.erasedBy.map((index) => drawing.strokes[index])
        );
        break;
      case "images": {
        const { item } = layer;
        const element = images.get(item.id);
        if (element) {
          context.drawImage(element, item.x, item.y, item.width, item.height);
        }
        break;
      }
      case "texts":
        drawSpans(context, layOutTextBox(layer.item, textStyle, measurer));
        break;
      case "notes":
        drawNote(context, layer.item, textStyle, measurer);
        break;
      case "shapes":
        drawShape(context, layer.item);
        break;
    }
  }
  return image;
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

// The stroke as an SVG shape in `color`, drawn the way `drawStroke` draws it:
// one path, or a pen's pieces each as wide as it pressed. A see-through one
// is see-through as a whole, so where it crosses itself isn't any darker.
function createShape(stroke: Stroke, color: string): string {
  const { points, opacity } = stroke;
  const paint = escapeAttribute(color);
  let shape: string;
  if (points.length === 1) {
    const [{ x, y }] = points;
    shape = `<circle cx="${round(x)}" cy="${round(y)}" r="${round(getDotSize(stroke))}" fill="${paint}"/>`;
  } else {
    const toPath = (pieces: StrokePiece[]) =>
      `M${round(pieces[0].from.x)} ${round(pieces[0].from.y)}` +
      pieces
        .map(({ control, to }) =>
          control
            ? `Q${round(control.x)} ${round(control.y)} ${round(to.x)} ${round(to.y)}`
            : `L${round(to.x)} ${round(to.y)}`
        )
        .join("");
    const toElement = (pieces: StrokePiece[]) =>
      `<path d="${toPath(pieces)}" fill="none" stroke="${paint}" stroke-width="${round(pieces[0].size * 2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const pieces = getStrokePieces(stroke);
    shape = hasPressure(stroke)
      ? pieces.map((piece) => toElement([piece])).join("")
      : toElement(pieces);
  }
  return opacity === undefined
    ? shape
    : `<g opacity="${round(opacity)}">${shape}</g>`;
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

// A shape as one path, drawn the way `drawShape` draws it.
function createShapeElement(shape: Shape): string {
  const fill = shape.fill === null ? "none" : escapeAttribute(shape.fill);
  return `<path d="${getShapePath(shape)}" fill="${fill}" stroke="${escapeAttribute(shape.color)}" stroke-width="${round(shape.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function createImageElement(
  { x, y, width, height }: ImageItem,
  url: string
): string {
  return `<image href="${escapeAttribute(url)}" x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" preserveAspectRatio="none"/>`;
}

// Strokes as SVG, each eraser masking the strokes before it. `masks` gets
// each eraser's mask, named by `name` with the stroke's index. Erasers in
// `erasedBy` are drawn above them, and their masks are made elsewhere.
function createStrokes(
  strokes: Stroke[],
  bounds: string,
  name: (index: number) => string,
  masks: string[],
  erasedBy: number[] = [],
  start = 0
): string {
  let content = "";
  strokes.forEach((stroke, offset) => {
    if (stroke.points.length === 0) {
      return;
    }
    if (stroke.color !== undefined) {
      content += createShape(stroke, stroke.color);
      return;
    }
    // White keeps what's under the mask, and the eraser's black hides it.
    const id = name(start + offset);
    masks.push(
      `<mask id="${id}" maskUnits="userSpaceOnUse" ${bounds}><rect ${bounds} fill="#fff"/>${createShape(stroke, "#000")}</mask>`
    );
    if (content) {
      content = `<g mask="url(#${id})">${content}</g>`;
    }
  });
  if (!content) {
    return "";
  }
  for (const index of erasedBy) {
    content = `<g mask="url(#${name(index)})">${content}</g>`;
  }
  return content;
}

// Fills as SVG, each eraser after them masking them. Its masks are made with
// the strokes', named by `name`.
function createFills(
  fills: Fill[],
  strokes: Stroke[],
  name: (index: number) => string
): string {
  let content = "";
  for (const step of getFillSteps(fills, strokes)) {
    if ("eraser" in step) {
      content = `<g mask="url(#${name(step.index)})">${content}</g>`;
      continue;
    }
    const path = step.fill.rings
      .filter((ring) => ring.length > 0)
      .map(
        (ring) =>
          ring
            .map(
              ({ x, y }, index) =>
                `${index === 0 ? "M" : "L"}${round(x)} ${round(y)}`
            )
            .join("") + "Z"
      )
      .join("");
    content += `<path d="${path}" fill="${escapeAttribute(step.fill.color)}" fill-rule="evenodd"/>`;
  }
  return content;
}

// The note as an SVG rectangle, with its fills, its text and the strokes
// drawn on it, clipped to it. `index` keeps its masks' and clip's names apart from other
// notes'.
function createNote(
  note: Note,
  index: number,
  textStyle: TextStyle,
  measurer: TextMeasurer,
  masks: string[]
): string {
  const shape = `width="${round(note.width)}" height="${round(note.height)}" rx="${NOTE_LAYOUT.cornerRadius}"`;
  const rect = `<rect x="${round(note.x)}" y="${round(note.y)}" ${shape} fill="${escapeAttribute(note.color)}"/>`;
  const byline = layOutByline(note, textStyle, measurer);
  const text =
    createText(layOutNote(note, textStyle, measurer)) +
    (byline
      ? `<g fill-opacity="${NOTE_LAYOUT.bylineOpacity}">${createText([byline])}</g>`
      : "");
  // Its strokes and fills are from its top left corner, like the note's own.
  const name = (stroke: number) => `note-${index}-erase-${stroke}`;
  const ink = createStrokes(
    note.strokes,
    `x="0" y="0" width="${round(note.width)}" height="${round(note.height)}"`,
    name,
    masks
  );
  const fills = createFills(note.fills, note.strokes, name);
  if (!ink && !fills) {
    return rect + text;
  }
  const clip = `note-${index}-clip`;
  masks.push(`<clipPath id="${clip}"><rect ${shape}/></clipPath>`);
  const inside = (content: string) =>
    content
      ? `<g transform="translate(${round(note.x)} ${round(note.y)})" clip-path="url(#${clip})">${content}</g>`
      : "";
  return `${rect}${inside(fills)}${text}${inside(ink)}`;
}

/**
 * The part of the drawing in `area` as SVG, `scale` times its size in drawing
 * units, so it opens at the chosen size and stays sharp at any other. The
 * eraser only erases strokes drawn before it, so each eraser stroke masks
 * them, but nothing placed. `imageUrls` are the images' files as `data:`
 * URLs, by id. `author`, if there is one, is kept as the file's creator.
 */
export function createSvg(
  drawing: Drawing,
  area: Box,
  scale: ExportScale,
  fill: string | null,
  textStyle: TextStyle,
  imageUrls: Map<string, string>,
  author = ""
): string {
  const x = round(area.x);
  const y = round(area.y);
  const width = round(area.width);
  const height = round(area.height);
  const pixels = getExportSize(area, scale);
  // The area, as SVG attributes.
  const bounds = `x="${x}" y="${y}" width="${width}" height="${height}"`;
  const masks: string[] = [];
  const measurer = createMeasurer();
  let notes = 0;
  // Fills are below everything else.
  let content = createFills(
    drawing.fills,
    drawing.strokes,
    (index) => `erase-${index}`
  );
  // Bottom to top, the way the canvas shows them.
  for (const layer of resolveLayers(drawing)) {
    switch (layer.kind) {
      case "strokes":
        content += createStrokes(
          layer.strokes,
          bounds,
          (index) => `erase-${index}`,
          masks,
          layer.erasedBy,
          layer.start
        );
        break;
      case "images": {
        const url = imageUrls.get(layer.item.id);
        if (url) {
          content += createImageElement(layer.item, url);
        }
        break;
      }
      case "texts":
        content += createText(layOutTextBox(layer.item, textStyle, measurer));
        break;
      case "notes":
        content += createNote(layer.item, notes++, textStyle, measurer, masks);
        break;
      case "shapes":
        content += createShapeElement(layer.item);
        break;
    }
  }
  const background = fill
    ? `<rect ${bounds} fill="${escapeAttribute(fill)}"/>`
    : "";
  const defs = masks.length > 0 ? `<defs>${masks.join("")}</defs>` : "";
  // Dublin Core's creator, which is how SVG editors record an author.
  const metadata = author
    ? `<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><rdf:Description><dc:creator>${escapeAttribute(author)}</dc:creator></rdf:Description></rdf:RDF></metadata>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels.width}" height="${pixels.height}" viewBox="${x} ${y} ${width} ${height}">${metadata}${defs}${background}${content}</svg>`;
}
