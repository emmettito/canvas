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
import { isCustomColor, isToolColor } from "./colors";
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
// pressure or opacity.
function isStroke(value: unknown): value is Stroke {
  return (
    isObject(value) &&
    (value.color === undefined || typeof value.color === "string") &&
    isNumber(value.size) &&
    (value.opacity === undefined || isFraction(value.opacity)) &&
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
  const strokes = saved.strokes ?? [];
  const fills = saved.fills ?? [];
  if (
    !content ||
    typeof saved.color !== "string" ||
    !Array.isArray(strokes) ||
    !strokes.every(isStroke) ||
    !Array.isArray(fills) ||
    !fills.every(isFill)
  ) {
    return null;
  }
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
    fills,
  };
  // Notes saved before they could be signed have no authors, and ones saved
  // before more than one could sign have one `author`.
  const authors = Array.isArray(saved.authors)
    ? saved.authors.filter((name) => typeof name === "string" && name !== "")
    : [saved.author].filter((name) => typeof name === "string" && name !== "");
  if (authors.length > 0) {
    note.authors = authors as string[];
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
// and shapes have no note color, text size, recent colors, rulers,
// highlighter or shape, so they're checked on their own.
function isToolSettings(value: unknown): value is Omit<
  ToolSettings,
  "tools" | "noteColor" | "textSize" | "shapeType" | "recentColors" | "rulers"
> & {
  tools: Omit<ToolSettings["tools"], "highlighter"> & { highlighter?: unknown };
  shapeType?: unknown;
  noteColor?: unknown;
  textSize?: unknown;
  recentColors?: unknown;
  rulers?: unknown;
} {
  if (
    !isObject(value) ||
    !TOOLS.includes(value.activeTool as Tool) ||
    !isObject(value.tools)
  ) {
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

// Where the data goes: local storage, or memory when there's no storage key.
interface Store {
  read(key: string): unknown;
  // False if it couldn't be written, e.g. because storage is full.
  write(key: string, value: unknown): boolean;
  remove(key: string): void;
}

const localStore: Store = {
  read(key) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? null : JSON.parse(value);
    } catch {
      // Storage can be unavailable, e.g. in some private windows, or the value
      // isn't JSON.
      return null;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      // Storage can be unavailable or full. The canvas still works, it just
      // won't be restored.
      console.warn(`The canvas couldn't be saved to ${key}.`, error);
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing was saved there, since storage is unavailable.
    }
  },
};

function createMemoryStore(): Store {
  const values = new Map<string, unknown>();
  return {
    read: (key) => values.get(key) ?? null,
    write: (key, value) => {
      values.set(key, value);
      return true;
    },
    remove: (key) => values.delete(key),
  };
}

/**
 * Saves the history of canvases, each canvas's drawing, which one is open, the
 * tool settings and the last export options in local storage, under keys
 * starting with `key`. Without a key, they're kept in memory instead, so they
 * last until the page closes.
 *
 * Each save returns false if it couldn't be written, e.g. because storage is
 * full.
 */
export class CanvasStorage {
  #key: string;
  #store: Store;

  constructor(key?: string) {
    this.#key = key ?? "canvas";
    this.#store = key ? localStore : createMemoryStore();
  }

  loadToolSettings(): ToolSettings | null {
    const settings = this.#store.read(`${this.#key}:settings`);
    if (!isToolSettings(settings)) {
      return null;
    }
    const { activeTool, tools, noteColor, textSize, recentColors, rulers } =
      settings;
    const { highlighter } = tools;
    return {
      // The dropper is only picked for a moment, so it isn't kept.
      activeTool: activeTool === "dropper" ? "pencil" : activeTool,
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
      noteColor: isToolColor(noteColor) ? noteColor : DEFAULT_NOTE_COLOR,
      textSize: isTextSize(textSize) ? textSize : TEXT_LAYOUT.defaultSize,
      recentColors: Array.isArray(recentColors)
        ? recentColors.filter(isCustomColor).slice(0, MAX_RECENT_COLORS)
        : [],
      rulers: rulers === true,
    };
  }

  saveToolSettings(settings: ToolSettings): boolean {
    return this.#store.write(`${this.#key}:settings`, settings);
  }

  /** The options last exported with. */
  loadExportOptions(): ExportOptions | null {
    const options = this.#store.read(`${this.#key}:export`);
    return isExportOptions(options) ? options : null;
  }

  saveExportOptions(options: ExportOptions): boolean {
    return this.#store.write(`${this.#key}:export`, options);
  }

  /** The id of the canvas that was open, or null for a blank one. */
  loadOpenCanvas(): string | null {
    const id = this.#store.read(`${this.#key}:open`);
    return typeof id === "string" ? id : null;
  }

  saveOpenCanvas(id: string | null): boolean {
    return this.#store.write(`${this.#key}:open`, id);
  }

  /** The canvases in the history, most recently edited first. */
  loadCanvases(): CanvasEntry[] {
    const canvases = this.#store.read(`${this.#key}:canvases`);
    return Array.isArray(canvases) ? canvases.filter(isEntry) : [];
  }

  saveCanvases(canvases: CanvasEntry[]): boolean {
    return this.#store.write(`${this.#key}:canvases`, canvases);
  }

  loadStrokes(id: string): Stroke[] | null {
    const strokes = this.#store.read(this.#canvasKey(id, "strokes"));
    return Array.isArray(strokes) && strokes.every(isStroke) ? strokes : null;
  }

  saveStrokes(id: string, strokes: Stroke[]): boolean {
    return this.#store.write(this.#canvasKey(id, "strokes"), strokes);
  }

  /** A canvas's fills. Null if it has none saved, e.g. from before them. */
  loadFills(id: string): Fill[] | null {
    const fills = this.#store.read(this.#canvasKey(id, "fills"));
    return Array.isArray(fills) && fills.every(isFill) ? fills : null;
  }

  saveFills(id: string, fills: Fill[]): boolean {
    return this.#store.write(this.#canvasKey(id, "fills"), fills);
  }

  /** A canvas's images, text or notes, by `kind`. */
  loadItems<K extends ItemKind>(id: string, kind: K): DrawingItem<K>[] | null {
    const saved = this.#store.read(this.#canvasKey(id, kind));
    if (!Array.isArray(saved)) {
      return null;
    }
    const items = saved.map(ITEM_READERS[kind]);
    return items.every((item) => item !== null) ? items : null;
  }

  saveItems<K extends ItemKind>(
    id: string,
    kind: K,
    items: DrawingItem<K>[]
  ): boolean {
    return this.#store.write(this.#canvasKey(id, kind), items);
  }

  /**
   * A canvas's stacking order. Null if it has none, e.g. it was saved before
   * there was one. The caller checks it matches the drawing.
   */
  loadOrder(id: string): Layer[] | null {
    const order = this.#store.read(this.#canvasKey(id, "order"));
    return Array.isArray(order) && order.every(isLayer)
      ? order.map((layer: Layer) =>
          layer.kind === "strokes"
            ? { kind: layer.kind, count: layer.count }
            : { kind: layer.kind, id: layer.id }
        )
      : null;
  }

  saveOrder(id: string, order: Layer[]): boolean {
    return this.#store.write(this.#canvasKey(id, "order"), order);
  }

  /**
   * A canvas's background. Null if it has none, e.g. it was saved before
   * canvases had their own.
   */
  loadBackground(id: string): string | null {
    const background = this.#store.read(this.#canvasKey(id, "background"));
    return isBackground(background) ? background : null;
  }

  saveBackground(id: string, background: string): boolean {
    return this.#store.write(this.#canvasKey(id, "background"), background);
  }

  /** Which part of a canvas was shown, and how big. */
  loadViewport(id: string): Viewport | null {
    const viewport = this.#store.read(this.#canvasKey(id, "viewport"));
    return isViewport(viewport) ? viewport : null;
  }

  saveViewport(id: string, viewport: Viewport): boolean {
    return this.#store.write(this.#canvasKey(id, "viewport"), viewport);
  }

  /**
   * Removes a canvas's drawing, except its images' files. The caller removes
   * it from the history.
   */
  deleteCanvas(id: string): void {
    for (const part of [
      "strokes",
      "fills",
      "background",
      "viewport",
      "order",
      ...ITEM_KINDS,
    ] as const) {
      this.#store.remove(this.#canvasKey(id, part));
    }
  }

  #canvasKey(
    id: string,
    part: "strokes" | "fills" | "background" | "viewport" | "order" | ItemKind
  ): string {
    return `${this.#key}:canvas:${id}:${part}`;
  }
}
