import { isOldInk, upgradeInk } from "./upgrade-drawing";
import { COLORS } from "../constants/colors.const";
import { DEFAULT_NOTE_COLOR } from "../constants/default-note-color.const";
import { DEFAULT_TOOL_SIZES } from "../constants/default-tool-sizes.const";
import { EXPORT_FORMATS } from "../constants/export-formats.const";
import { EXPORT_SCALES } from "../constants/export-scales.const";
import { HIGHLIGHTER } from "../constants/highlighter.const";
import { ITEM_KINDS } from "../constants/item-kinds.const";
import { MAX_RECENT_COLORS } from "../constants/recent-colors.const";
import { MAX_TOOL_SIZE } from "../constants/max-tool-size.const";
import { MIN_TOOL_SIZE } from "../constants/min-tool-size.const";
import { TEXT_LAYOUT } from "../constants/text-layout.const";
import { TOOLS } from "../constants/tools.const";
import { type CanvasEntry } from "../models/canvas-entry.model";
import { type DrawingItem, type ItemKind } from "../models/drawing.model";
import {
  type ExportFormat,
  type ExportOptions,
  type ExportScale,
} from "../models/export-options.model";
import { type Fill } from "../models/fill.model";
import { type ImageItem } from "../models/image-item.model";
import { type Layer } from "../models/layer.model";
import { type Note } from "../models/note.model";
import { type RichText } from "../models/rich-text.model";
import { type Stroke } from "../models/stroke.model";
import { type TextBox } from "../models/text-box.model";
import { type ToolSettings } from "../models/tool-settings.model";
import { type Tool } from "../models/tool.model";
import { type Viewport } from "../models/viewport.model";
import {
  type ColorFormats,
  DEFAULT_COLOR_FORMATS,
  isColorFormat,
} from "./color-formats";
import { isCustomColor, isToolColor } from "./colors";
import { mergeRuns } from "./layers";
import { getFullName, splitName } from "./person-names";
import { fromPlainText, isRichText } from "./rich-text";
import { clampZoom } from "./viewport";

/*
 * Saved data is read back from storage the host page shares, possibly by an
 * older version of the library, so it's checked before it's used. Anything
 * that doesn't match is ignored rather than breaking the canvas.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFraction(value: unknown): value is number {
  return isNumber(value) && value >= 0 && value <= 1;
}

// Strokes saved before pens pressed or strokes could be see-through have no
// pressure or opacity, and ones saved before they could be picked have no id.
export function isStroke(value: unknown): value is Stroke {
  return (
    isObject(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.color === undefined || typeof value.color === "string") &&
    isNumber(value.size) &&
    (value.opacity === undefined || isFraction(value.opacity)) &&
    (value.cap === undefined || value.cap === "square") &&
    Array.isArray(value.points) &&
    value.points.every(
      (point) =>
        isObject(point) &&
        isNumber(point.x) &&
        isNumber(point.y) &&
        (point.pressure === undefined || isFraction(point.pressure))
    )
  );
}

function isPoint(value: unknown): boolean {
  return isObject(value) && isNumber(value.x) && isNumber(value.y);
}

function isFill(value: unknown): value is Fill {
  return (
    isObject(value) &&
    typeof value.color === "string" &&
    Number.isInteger(value.after) &&
    (value.after as number) >= 0 &&
    Array.isArray(value.rings) &&
    value.rings.every((ring) => Array.isArray(ring) && ring.every(isPoint))
  );
}

function isPositive(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

// Every item has an id and a top left corner.
function isPlaced(value: unknown): value is Record<string, unknown> {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    isNumber(value.x) &&
    isNumber(value.y)
  );
}

function isImageItem(value: unknown): value is ImageItem {
  return isPlaced(value) && isPositive(value.width) && isPositive(value.height);
}

function isOptionalSize(value: unknown): value is number | null {
  return value === null || isPositive(value);
}

// Notes and text saved before formatting have plain `text`, which becomes
// their content. Null if `value` has neither.
function readContent(value: Record<string, unknown>): RichText | null {
  if (isRichText(value.content)) {
    return value.content;
  }
  return typeof value.text === "string" ? fromPlainText(value.text) : null;
}

function readTextBox(value: unknown): TextBox | null {
  if (
    !isPlaced(value) ||
    !isOptionalSize(value.width) ||
    // Text saved before it could be resized has no height, so it fits.
    !(value.height === undefined || isOptionalSize(value.height)) ||
    !isPositive(value.fontSize) ||
    typeof value.color !== "string"
  ) {
    return null;
  }
  const content = readContent(value);
  return (
    content && {
      id: value.id as string,
      x: value.x as number,
      y: value.y as number,
      width: value.width,
      height: value.height ?? null,
      fontSize: value.fontSize,
      color: value.color,
      content,
    }
  );
}

function readNote(value: unknown): Note | null {
  if (!isImageItem(value)) {
    return null;
  }
  const saved = value as unknown as Record<string, unknown>;
  const content = readContent(saved);
  // Notes saved before they could be drawn on or filled have no strokes or
  // fills.
  const savedStrokes = saved.strokes ?? [];
  const savedFills = saved.fills ?? [];
  const savedErasers = saved.erasers ?? [];
  if (
    !content ||
    typeof saved.color !== "string" ||
    !Array.isArray(savedStrokes) ||
    !savedStrokes.every(isStroke) ||
    !Array.isArray(savedFills) ||
    !savedFills.every(isFill) ||
    !Array.isArray(savedErasers) ||
    !savedErasers.every(isStroke)
  ) {
    return null;
  }
  // Strokes saved before erasers cut them are as they are now.
  const { strokes, erasers, fills } = isOldInk(savedStrokes)
    ? upgradeInk(savedStrokes, savedFills)
    : { strokes: savedStrokes, erasers: savedErasers, fills: savedFills };
  const { id, x, y, width, height } = value;
  const note: Note = {
    id,
    x,
    y,
    width,
    height,
    color: saved.color,
    content,
    strokes,
    erasers,
    fills,
  };
  // Notes saved before they could be signed have no authors, and ones saved
  // before more than one could sign have one `author`. Ones saved before
  // first and last names were apart have whole names.
  const authors = (
    Array.isArray(saved.authors) ? saved.authors : [saved.author]
  ).flatMap((name: unknown) => {
    const read =
      typeof name === "string"
        ? splitName(name)
        : isObject(name) &&
            typeof name.firstName === "string" &&
            typeof name.lastName === "string"
          ? { firstName: name.firstName, lastName: name.lastName }
          : null;
    return read && getFullName(read) ? [read] : [];
  });
  if (authors.length > 0) {
    note.authors = authors;
  }
  return note;
}

function isLayer(value: unknown): value is Layer {
  if (!isObject(value)) {
    return false;
  }
  if (value.kind === "strokes") {
    return Number.isInteger(value.count) && isPositive(value.count);
  }
  return (
    ITEM_KINDS.includes(value.kind as ItemKind) && typeof value.id === "string"
  );
}

// Each kind's items as they're used, or null if one isn't valid.
const ITEM_READERS: {
  [K in ItemKind]: (value: unknown) => DrawingItem<K> | null;
} = {
  images: (value) =>
    isImageItem(value)
      ? {
          id: value.id,
          x: value.x,
          y: value.y,
          width: value.width,
          height: value.height,
        }
      : null,
  texts: readTextBox,
  notes: readNote,
};

/**
 * An item of `kind` as it's used, or null if `value` isn't one, e.g. one
 * pasted from another page.
 */
export function readItem<K extends ItemKind>(
  kind: K,
  value: unknown
): DrawingItem<K> | null {
  return ITEM_READERS[kind](value);
}

// A CSS color, as the canvas saves them: "#rrggbb" or "rgb(...)".
function isBackground(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%/]+\))$/i.test(value)
  );
}

function isViewport(value: unknown): value is Viewport {
  return (
    isObject(value) &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isPositive(value.zoom) &&
    // A zoom out of range, e.g. from a version that allowed more, isn't used.
    clampZoom(value.zoom) === value.zoom
  );
}

function isTextSize(value: unknown): value is number {
  return (
    isNumber(value) &&
    value >= TEXT_LAYOUT.minSize &&
    value <= TEXT_LAYOUT.maxSize
  );
}

function isToolSize(value: unknown): value is number {
  return isNumber(value) && value >= MIN_TOOL_SIZE && value <= MAX_TOOL_SIZE;
}

// Settings saved before notes, text, custom colors, rulers, the highlighter
// and the bucket's own color have no note color, text size, recent colors,
// rulers, highlighter or bucket color, so they're checked on their own. A
// tool that's been removed, e.g. the shape tool, is checked on its own too.
function isToolSettings(value: unknown): value is Omit<
  ToolSettings,
  | "activeTool"
  | "tools"
  | "bucketColor"
  | "noteColor"
  | "textSize"
  | "recentColors"
  | "colorFormats"
  | "rulers"
> & {
  activeTool: unknown;
  tools: Omit<ToolSettings["tools"], "highlighter"> & { highlighter?: unknown };
  bucketColor?: unknown;
  noteColor?: unknown;
  textSize?: unknown;
  recentColors?: unknown;
  colorFormats?: unknown;
  rulers?: unknown;
} {
  if (!isObject(value) || !isObject(value.tools)) {
    return false;
  }
  const { eraser, pencil } = value.tools;
  return (
    isObject(eraser) &&
    eraser.color === undefined &&
    isToolSize(eraser.size) &&
    isObject(pencil) &&
    isToolColor(pencil.color) &&
    isToolSize(pencil.size)
  );
}

function isExportOptions(value: unknown): value is ExportOptions {
  return (
    isObject(value) &&
    EXPORT_FORMATS.includes(value.format as ExportFormat) &&
    EXPORT_SCALES.includes(value.scale as ExportScale) &&
    typeof value.transparent === "boolean"
  );
}

function isEntry(value: unknown): value is CanvasEntry {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isNumber(value.updatedAt)
  );
}

/** Tool settings as they're used, or null if `value` isn't any. */
export function readToolSettings(value: unknown): ToolSettings | null {
  if (!isToolSettings(value)) {
    return null;
  }
  const {
    activeTool,
    tools,
    bucketColor,
    noteColor,
    textSize,
    recentColors,
    colorFormats,
    rulers,
  } = value;
  const { highlighter } = tools;
  return {
    // The dropper is only picked for a moment, so it isn't kept, and a tool
    // that's been removed is the pencil.
    activeTool:
      TOOLS.includes(activeTool as Tool) && activeTool !== "dropper"
        ? (activeTool as Tool)
        : "pencil",
    tools: {
      ...tools,
      highlighter:
        isObject(highlighter) &&
        isToolColor(highlighter.color) &&
        isToolSize(highlighter.size)
          ? { color: highlighter.color, size: highlighter.size }
          : {
              color: HIGHLIGHTER.color,
              size: DEFAULT_TOOL_SIZES.highlighter,
            },
    },
    // The bucket filled in the pencil's color before it had its own. The
    // pencil's is checked, so the fallback only satisfies the type.
    bucketColor: isToolColor(bucketColor)
      ? bucketColor
      : (tools.pencil.color ?? COLORS[0]),
    noteColor: isToolColor(noteColor) ? noteColor : DEFAULT_NOTE_COLOR,
    textSize: isTextSize(textSize) ? textSize : TEXT_LAYOUT.defaultSize,
    recentColors: Array.isArray(recentColors)
      ? recentColors.filter(isCustomColor).slice(0, MAX_RECENT_COLORS)
      : [],
    colorFormats: Object.fromEntries(
      Object.entries(DEFAULT_COLOR_FORMATS).map(([target, fallback]) => {
        const format = isObject(colorFormats)
          ? colorFormats[target]
          : undefined;
        return [target, isColorFormat(format) ? format : fallback];
      })
    ) as ColorFormats,
    rulers: rulers === true,
  };
}

/** The options last exported with, or null if `value` isn't any. */
export function readExportOptions(value: unknown): ExportOptions | null {
  return isExportOptions(value) ? value : null;
}

/** The canvases in a list of them, leaving out any that aren't one. */
export function readEntries(value: unknown): CanvasEntry[] {
  return Array.isArray(value) ? value.filter(isEntry) : [];
}

function readStrokes(value: unknown): Stroke[] | null {
  return Array.isArray(value) && value.every(isStroke) ? value : null;
}

function readFills(value: unknown): Fill[] | null {
  return Array.isArray(value) && value.every(isFill) ? value : null;
}

function readItems<K extends ItemKind>(
  kind: K,
  value: unknown
): DrawingItem<K>[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items = value.map(ITEM_READERS[kind]);
  return items.every((item) => item !== null) ? items : null;
}

// A stacking order, or null if it isn't one. Whoever reads it checks it
// matches the drawing.
function readOrder(value: unknown): Layer[] | null {
  // Shapes have been removed, so the rest is stacked as it was without them.
  const order = Array.isArray(value)
    ? value.filter((layer) => !isObject(layer) || layer.kind !== "shapes")
    : null;
  return order?.every(isLayer)
    ? mergeRuns(
        order.map((layer: Layer) =>
          layer.kind === "strokes"
            ? { kind: layer.kind, count: layer.count }
            : { kind: layer.kind, id: layer.id }
        )
      )
    : null;
}

/** A saved drawing's parts, each null if it's missing or isn't valid. */
export interface SavedParts {
  strokes: Stroke[] | null;
  fills: Fill[] | null;
  erasers: Stroke[] | null;
  images: ImageItem[] | null;
  texts: TextBox[] | null;
  notes: Note[] | null;
  order: Layer[] | null;
  background: string | null;
}

/**
 * The parts of a drawing, as a page saved it. Each part is checked on its
 * own, so one that isn't valid, e.g. from an older version, is null without
 * losing the rest.
 */
export function readDrawing(value: unknown): SavedParts {
  const saved = isObject(value) ? value : {};
  return {
    strokes: readStrokes(saved.strokes),
    fills: readFills(saved.fills),
    erasers: readStrokes(saved.erasers),
    images: readItems("images", saved.images),
    texts: readItems("texts", saved.texts),
    notes: readItems("notes", saved.notes),
    order: readOrder(saved.order),
    background: isBackground(saved.background) ? saved.background : null,
  };
}

/** Which part of a canvas was shown, and how big, or null if it isn't one. */
export function readViewport(value: unknown): Viewport | null {
  return isViewport(value) ? value : null;
}
