import { FILL_LAYOUT } from "../../constants/fill-layout.const";
import { IMAGE_LAYOUT } from "../../constants/image-layout.const";
import { NOTE_LAYOUT } from "../../constants/note-layout.const";
import { RESIZE_HANDLES } from "../../constants/resize-handles.const";
import { TEXT_LAYOUT } from "../../constants/text-layout.const";
import { ZOOM } from "../../constants/zoom.const";
import { type Box } from "../../models/box.model";
import { type CustomColor, type ToolColor } from "../../models/color.model";
import {
  type Drawing,
  type DrawingItem,
  type ItemKind,
} from "../../models/drawing.model";
import { type ExportOptions } from "../../models/export-options.model";
import { type Fill } from "../../models/fill.model";
import { type ImageItem } from "../../models/image-item.model";
import { type Layer } from "../../models/layer.model";
import { type Note } from "../../models/note.model";
import { type Point } from "../../models/point.model";
import { type RichText } from "../../models/rich-text.model";
import { type Size } from "../../models/size.model";
import { type Stroke } from "../../models/stroke.model";
import { type TextBox } from "../../models/text-box.model";
import {
  type TextEditor,
  type TextEditorFactory,
} from "../../models/text-editor.model";
import { type ToolState } from "../../models/tool-state.model";
import { type Viewport } from "../../models/viewport.model";
import { createElement } from "../../utilities/create-element";
import { createId } from "../../utilities/create-id";
import { drawFills } from "../../utilities/draw-fills";
import { drawStroke } from "../../utilities/draw-stroke";
import {
  isDarkColor,
  parseColor,
  resolveColor,
  toHex,
} from "../../utilities/colors";
import { exportDrawing, renderDrawing } from "../../utilities/export-drawing";
import { getCssVariable } from "../../utilities/get-css-variable";
import {
  floodFill,
  growMask,
  simplifyRing,
  touchesEdge,
  traceMask,
} from "../../utilities/flood-fill";
import { getNoteColor } from "../../utilities/lighten-color";
import { resizeBox, resizeBoxKeepingShape } from "../../utilities/resize-box";
import { isField } from "../../utilities/is-field";
import { isAtEdge, type Restack, resolveLayers } from "../../utilities/layers";
import { isBlank } from "../../utilities/rich-text";
import {
  DEFAULT_VIEWPORT,
  fitViewport,
  getFillBox,
  getStrokeBox,
  getVisibleArea,
  intersectBoxes,
  panBy,
  stepZoom,
  toDrawingPoint,
  unionBoxes,
  zoomAround,
} from "../../utilities/viewport";
import { FormatBar } from "./format-bar";
import { ItemLayer, type ItemView, type PlacedItem } from "./item-layer";

import "./canvas.css";

export interface CanvasOptions {
  onStrokeComplete: (stroke: Stroke) => void;
  onItemAdd: <K extends ItemKind>(kind: K, item: DrawingItem<K>) => void;
  // An item was moved, resized or retyped.
  onItemChange: <K extends ItemKind>(kind: K, item: DrawingItem<K>) => void;
  onItemRemove: (kind: ItemKind, id: string) => void;
  // An item was brought to the front, or sent to the back.
  onItemRestack: (kind: ItemKind, id: string, to: Restack) => void;
  // An image's file, or null if it's missing.
  getImage: (id: string) => Promise<Blob | null>;
  // Makes the editor notes and text are shown and typed in with.
  createTextEditor: TextEditorFactory;
  // The canvas was zoomed or panned, e.g. by scrolling.
  onViewportChange: (viewport: Viewport) => void;
  // The paint bucket filled an area of the drawing.
  onFill: (fill: Fill) => void;
  // The paint bucket was pressed where nothing's closed in, so it did
  // nothing.
  onNothingToFill: () => void;
  // The dropper picked a color from the drawing.
  onPickColor: (color: CustomColor) => void;
  // A custom color was picked in the format bar, to pick again.
  onCustomColor: (color: CustomColor) => void;
}

/** What pressing the canvas places, instead of drawing. */
export type Placing =
  | { kind: "notes"; color: ToolColor }
  | { kind: "texts"; color: ToolColor; fontSize: number };

// A note or text box, which is typed in.
type TypedItem = PlacedItem & { content: RichText };

interface TypedView<T extends TypedItem> extends ItemView<T> {
  editor: TextEditor;
}

// Which items are typed in.
type TypedKind = "notes" | "texts";

// What's drawn on a note's own canvas, at its size in pixels.
interface Inked {
  strokes: Stroke[];
  fills: Fill[];
  width: number;
  height: number;
}

// A note, with the strokes drawn on it and its fills, which are only drawn
// on canvases of their own once it has some: its fills below its text, and
// its strokes above.
interface NoteView extends TypedView<Note> {
  ink: HTMLCanvasElement | null;
  inked: Inked | null;
  fillCanvas: HTMLCanvasElement | null;
  filled: Inked | null;
}

// An action in an item's menu.
interface MenuAction {
  label: string;
  onSelect: () => void;
  // Shown, but it would do nothing.
  disabled?: boolean;
}

interface ImageView extends ItemView<ImageItem> {
  image: HTMLImageElement;
}

// What's drawn on a run of strokes' canvas: its strokes, and erasers drawn
// above them, through the viewport, over `area`.
interface Painted {
  // In whole screen pixels from the canvas's top left.
  area: Box;
  pixelRatio: number;
  viewport: Viewport;
  strokes: Stroke[];
  erasers: Stroke[];
}

// A canvas for strokes drawn one after another, with nothing placed between
// them, between the items below and above it. The one strokes are added to
// covers what the canvas shows, and the others only their strokes, so many
// runs don't take too much memory.
interface Run {
  canvas: HTMLCanvasElement;
  painted: Painted | null;
}

// What's drawn on the fills' canvas: the fills, and the erasers after them,
// through the viewport, at the canvas's size.
interface PaintedFills {
  fills: Fill[];
  erasers: Stroke[];
  width: number;
  height: number;
  pixelRatio: number;
  viewport: Viewport;
}

// A stroke being drawn: on the drawing, as part of a run of strokes, or on a
// note.
interface Drawn {
  stroke: Stroke;
  // The run it'll be part of, which may be new. Null for the eraser, which
  // erases every run.
  run: number | null;
  note: NoteView | null;
}

// Safari's pinch on a trackpad, which isn't a wheel event as elsewhere.
interface GestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

// Each stroke's box, once it's measured, since every run's is measured
// whenever the drawing is panned.
const strokeBoxes = new WeakMap<Stroke, Box | null>();

function getCachedStrokeBox(stroke: Stroke): Box | null {
  let box = strokeBoxes.get(stroke);
  if (box === undefined) {
    box = getStrokeBox(stroke);
    strokeBoxes.set(stroke, box);
  }
  return box;
}

function isSameBox(a: Box, b: Box): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

function isSame(a: Stroke[], b: Stroke[]): boolean {
  return a.length === b.length && startsWith(a, b);
}

function startsWith(strokes: Stroke[], prefix: Stroke[]): boolean {
  return (
    prefix.length <= strokes.length &&
    prefix.every((stroke, index) => stroke === strokes[index])
  );
}

// The most pixels a note's strokes are drawn with, so a big note zoomed in
// stays within what browsers can draw on one canvas.
const MAX_INK_PIXELS = 16_000_000;

/**
 * Puts a canvas among the items, which are zoomed and panned, over `area` of
 * the screen, in pixels from the canvas's top left. It's laid out at the
 * items' origin, in screen pixels, and moved there with a transform that
 * undoes theirs: browsers round where a canvas is laid out before zooming
 * it, which would put it pixels out at a high zoom.
 */
function placeOnScreen(
  canvas: HTMLCanvasElement,
  { x, y, zoom }: Viewport,
  area: Box
): void {
  canvas.style.width = px(area.width);
  canvas.style.height = px(area.height);
  canvas.style.transform = `translate(${x}px, ${y}px) scale(${1 / zoom}) translate(${area.x}px, ${area.y}px)`;
}

function px(value: number): string {
  return `${value}px`;
}

/**
 * The drawing surface. Strokes are drawn with the current tool, and images,
 * text and notes are placed above them.
 */
export class Canvas {
  // The interface layer sits above the canvas and handles all pointer input
  // that isn't on an item.
  #interfaceLayer = createElement("div", "canvas-input-layer");
  // The first run of strokes is always on this canvas, even before there
  // are strokes, and later runs on their own.
  #runs: Run[] = [
    { canvas: createElement("canvas", "canvas-drawing"), painted: null },
  ];
  #cursor = createElement("div", "canvas-cursor");
  // The drawing's strokes and items, stacked in its order, above the input
  // layer, so items can take pointer input themselves.
  #items = createElement("div", "canvas-items");
  // The drawing as it's shown: its background, strokes and items, and the
  // input on them. A theme can filter it, e.g. to show it dark.
  #surface = createElement("div", "canvas-surface");
  // Controls over the drawing, e.g. the format bar, which aren't filtered.
  #overlay = createElement("div", "canvas-overlay");
  #height = 0;
  #width = 0;
  #strokes: Stroke[] = [];
  #order: Layer[] = [];
  #fills: Fill[] = [];
  // Below everything, once there are fills.
  #fillCanvas: HTMLCanvasElement | null = null;
  #paintedFills: PaintedFills | null = null;
  // Whether pressing the drawing fills an area, with the paint bucket, and
  // whether one is being found, which takes a moment.
  #filling = false;
  #findingFill = false;
  #layers: {
    images: ItemLayer<ImageItem, ImageView>;
    texts: ItemLayer<TextBox, TypedView<TextBox>>;
    notes: ItemLayer<Note, NoteView>;
  };
  // Images' files as object URLs, by id, once they're loaded.
  #imageUrls = new Map<string, Promise<string | null>>();
  // Whether releasing the press places an item. Pressing the canvas to stop
  // typing in one doesn't.
  #placesOnRelease = false;
  // The note or text being typed in, which the format bar formats.
  // `from` is the item as typing started, to tell if it changed.
  #editing: {
    kind: TypedKind;
    view: TypedView<TypedItem>;
    from: TypedItem;
  } | null = null;
  #formatBar = new FormatBar((color) => this.#options.onCustomColor(color));
  // An item's menu, while it's open.
  #menu: HTMLElement | null = null;
  #toolState: ToolState;
  #placing: Placing | null = null;
  // Whether pressing items moves them, with the move tool, rather than
  // drawing over them.
  #moving = false;
  #options: CanvasOptions;
  #drawn: Drawn | null = null;
  #viewport: Viewport = DEFAULT_VIEWPORT;
  #background = "#ffffff";
  // Whether pressing the drawing picks a color from it, with the dropper.
  #picking = false;
  // Dragging the drawing around, with the middle button or Space held.
  #pan: { pointerId: number; last: Point } | null = null;
  #spaceHeld = false;
  // Whether the pointer is over the drawing, so Space pans it rather than
  // pressing the button that has focus.
  #hovered = false;
  // Touches on the canvas, by pointer, while two fingers pinch or pan.
  #touches = new Map<number, Point>();
  #pinch: { center: Point; distance: number } | null = null;
  // The zoom when Safari's pinch started, which its scale is relative to.
  #gestureZoom = 1;

  constructor(
    container: HTMLElement,
    toolState: ToolState,
    options: CanvasOptions
  ) {
    this.#toolState = toolState;
    this.#options = options;

    const layer = this.#interfaceLayer;
    layer.addEventListener("pointerdown", this.#onPointerDown);
    layer.addEventListener("pointermove", this.#onPointerMove);
    layer.addEventListener("pointerup", this.#onPointerUp);
    layer.addEventListener("pointercancel", this.#onPointerUp);
    layer.addEventListener("pointerleave", this.#onPointerLeave);
    layer.addEventListener("contextmenu", (event) => event.preventDefault());

    this.#layers = {
      images: this.#createImageLayer(),
      texts: this.#createTextLayer(),
      notes: this.#createNoteLayer(),
    };
    const { fontSize, lineHeight, padding, cornerRadius } = NOTE_LAYOUT;
    const notes = this.#layers.notes.element.style;
    notes.fontSize = px(fontSize);
    notes.lineHeight = String(lineHeight);
    notes.setProperty("--canvas-note-padding", px(padding));
    notes.setProperty("--canvas-note-radius", px(cornerRadius));
    this.#layers.texts.element.style.lineHeight = String(
      TEXT_LAYOUT.lineHeight
    );
    this.#formatBar.element.addEventListener(
      "focusout",
      this.#onEditingFocusOut
    );
    this.#items.append(
      this.#runs[0].canvas,
      this.#layers.images.element,
      this.#layers.texts.element,
      this.#layers.notes.element
    );
    layer.addEventListener("contextmenu", this.#onLayerContextMenu);
    this.#surface.append(layer, this.#items, this.#cursor);
    this.#overlay.append(this.#formatBar.element);
    container.append(this.#surface, this.#overlay);

    const surface = this.#surface;
    surface.addEventListener("wheel", this.#onWheel, { passive: false });
    surface.addEventListener("gesturestart", this.#onGestureStart);
    surface.addEventListener("gesturechange", this.#onGestureChange);
    // Before the drawing and items get them, so panning and pinching don't
    // also draw or drag.
    surface.addEventListener("pointerdown", this.#onSurfaceDown, true);
    surface.addEventListener("pointerdown", this.#onPick, true);
    surface.addEventListener("pointermove", this.#onSurfaceMove, true);
    surface.addEventListener("pointerup", this.#onSurfaceUp, true);
    surface.addEventListener("pointercancel", this.#onSurfaceUp, true);
    surface.addEventListener("pointerenter", () => {
      this.#hovered = true;
    });
    surface.addEventListener("pointerleave", () => {
      this.#hovered = false;
    });
    document.addEventListener("keydown", this.#onSpace);
    document.addEventListener("keyup", this.#onSpace);
    window.addEventListener("blur", this.#onWindowBlur);
    this.#applyViewport();
  }

  /** How big the part of the drawing the canvas shows is, in drawing units. */
  get drawingSize(): Size {
    const { width, height } = this.visibleArea;
    return { width, height };
  }

  /** The part of the drawing the canvas shows, in drawing units. */
  get visibleArea(): Box {
    return getVisibleArea(this.#viewport, {
      width: this.#width,
      height: this.#height,
    });
  }

  get viewport(): Viewport {
    return this.#viewport;
  }

  /** The color behind the drawing. On a dark one, its controls show light. */
  setBackground(color: string): void {
    this.#background = color;
    this.#surface.style.backgroundColor = color;
    this.#surface.toggleAttribute("data-dark", isDarkColor(color));
  }

  /** Whether pressing the drawing picks a color from it, with the dropper. */
  setPicking(picking: boolean): void {
    this.#picking = picking;
    this.#surface.toggleAttribute("data-picking", picking);
  }

  /** Whether pressing the drawing fills an area, with the paint bucket. */
  setFilling(filling: boolean): void {
    this.#filling = filling;
    this.#surface.toggleAttribute("data-filling", filling);
  }

  /**
   * Whether pressing items moves them, with the move tool, and dragging
   * anywhere else pans. Otherwise, the tool draws over them.
   */
  setMoving(moving: boolean): void {
    this.#moving = moving;
    this.#surface.toggleAttribute("data-moving", moving);
  }

  /** Custom colors picked before, which the format bar offers again. */
  setRecentColors(colors: CustomColor[]): void {
    this.#formatBar.setRecentColors(colors);
  }

  /** Shows another part of the drawing, e.g. once a canvas is opened. */
  setViewport(viewport: Viewport): void {
    if (viewport !== this.#viewport) {
      this.#viewport = viewport;
      this.#applyViewport();
    }
  }

  /** Zooms in or out a step, around the canvas's middle. */
  stepZoom(direction: "in" | "out"): void {
    this.#zoomAtCenter(stepZoom(this.#viewport.zoom, direction));
  }

  /** Zooms to `zoom`, e.g. 1 for 100%, around the canvas's middle. */
  zoomTo(zoom: number): void {
    this.#zoomAtCenter(zoom);
  }

  /** Shows the whole drawing, as big as fits, or 100% if it's empty. */
  zoomToFit(): void {
    const boxes: Box[] = [
      ...this.#strokes.flatMap((stroke) => getStrokeBox(stroke) ?? []),
      ...this.#fills.flatMap((fill) => getFillBox(fill) ?? []),
      ...this.#layers.images.items,
      ...this.#layers.notes.items,
      // Text's size is its text's, so it's measured.
      ...this.#layers.texts.items.map((box) => ({
        x: box.x,
        y: box.y,
        ...this.#layers.texts.getSize(box.id),
      })),
    ];
    this.#changeViewport(
      fitViewport(unionBoxes(boxes), {
        width: this.#width,
        height: this.#height,
      })
    );
  }

  setSize(width: number, height: number): void {
    this.#width = width;
    this.#height = height;
    this.#paint();
  }

  /**
   * The drawing's strokes, the order its strokes and items are stacked in,
   * once its items are set, and its fills.
   */
  setLayers(strokes: Stroke[], order: Layer[], fills: Fill[]): void {
    // Called on every toolbar change, so skip the paint if nothing changed.
    if (
      strokes === this.#strokes &&
      order === this.#order &&
      fills === this.#fills
    ) {
      return;
    }
    this.#strokes = strokes;
    this.#order = order;
    this.#fills = fills;
    this.#paint();
  }

  setItems<K extends ItemKind>(kind: K, items: DrawingItem<K>[]): void {
    // Each kind has its own layer, which TypeScript can't match to `K`.
    const layer = this.#layers[kind] as unknown as ItemLayer<
      DrawingItem<K>,
      ItemView<DrawingItem<K>>
    >;
    layer.setItems(items);
  }

  setToolState(toolState: ToolState): void {
    this.#toolState = toolState;
  }

  /** What pressing the canvas places, or null to draw with the tool. */
  setPlacing(placing: Placing | null): void {
    this.#placing = placing;
    const surface = this.#surface;
    if (placing) {
      surface.dataset.placing = placing.kind;
    } else {
      delete surface.dataset.placing;
    }
  }

  /** Picks an item, e.g. one just added, to move it or delete it. */
  select(kind: ItemKind, id: string): void {
    this.#layers[kind].getView(id)?.element.focus();
  }

  /** Where a point on screen is on the drawing. */
  getDrawingPoint(clientX: number, clientY: number): Point {
    return toDrawingPoint(
      this.#viewport,
      this.#toCanvasPoint(clientX, clientY)
    );
  }

  /**
   * Stops listening to the page, and stops using the images' object URLs,
   * once the canvas is removed.
   */
  destroy(): void {
    document.removeEventListener("keydown", this.#onSpace);
    document.removeEventListener("keyup", this.#onSpace);
    window.removeEventListener("blur", this.#onWindowBlur);
    for (const url of this.#imageUrls.values()) {
      void url.then((value) => value && URL.revokeObjectURL(value));
    }
    this.#imageUrls.clear();
  }

  /**
   * The drawing as a file, drawn again at the chosen scale rather than copied
   * from the screen, so its size doesn't depend on the screen's.
   */
  async export(options: ExportOptions): Promise<Blob | null> {
    const { drawing, textStyle, files } = await this.#getRendering();
    return exportDrawing(
      drawing,
      this.visibleArea,
      options,
      this.#background,
      textStyle,
      files
    );
  }

  // What drawing the drawing again needs: the drawing, how its text looks,
  // which comes from CSS, and its images' files.
  async #getRendering() {
    const textStyle = {
      noteColor: getCssVariable(
        this.#interfaceLayer,
        "--canvas-color-note-text"
      ),
      fontFamily: getComputedStyle(this.#items).fontFamily,
    };
    const drawing = this.#getDrawing();
    const files = new Map<string, Blob>();
    for (const { id } of drawing.images) {
      const file = await this.#options.getImage(id);
      if (file) {
        files.set(id, file);
      }
    }
    return { drawing, textStyle, files };
  }

  // The drawing, as it's shown.
  #getDrawing(): Drawing {
    return {
      background: this.#background,
      strokes: this.#strokes,
      fills: this.#fills,
      images: this.#layers.images.items,
      texts: this.#layers.texts.items,
      notes: this.#layers.notes.items,
      order: this.#order,
    };
  }

  // The color of the drawing at `point`, as it's drawn, including images,
  // notes and the background.
  async #sampleColor(point: Point): Promise<CustomColor | null> {
    const { drawing, textStyle, files } = await this.#getRendering();
    // One pixel, at the screen's zoom, so it's the color that's seen.
    const zoom = this.#viewport.zoom;
    const size = 1 / zoom;
    const image = await renderDrawing(
      drawing,
      {
        x: point.x - size / 2,
        y: point.y - size / 2,
        width: size,
        height: size,
      },
      zoom,
      this.#background,
      textStyle,
      files
    );
    const context = image?.getContext("2d");
    if (!context) {
      return null;
    }
    return toHex([...context.getImageData(0, 0, 1, 1).data]);
  }

  // With the dropper, pressing anywhere on the drawing picks its color, even
  // over an item, without drawing or dragging.
  #onPick = (event: PointerEvent): void => {
    if (!this.#picking || event.button !== 0 || !event.isPrimary) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const point = this.getDrawingPoint(event.clientX, event.clientY);
    void this.#sampleColor(point).then((color) => {
      if (color) {
        this.#options.onPickColor(color);
      }
    });
  };

  // Stacks the strokes and items in the drawing's order, and draws each run
  // of strokes on its canvas.
  #paint(): void {
    this.#paintFills();
    const layers = resolveLayers(this.#getDrawing());
    const drawn = this.#drawn;
    // The runs a stroke can be added to: the one on top of everything, and
    // the one being drawn on, which may be new.
    const count = layers.filter(({ kind }) => kind === "strokes").length;
    const onTop = layers.at(-1)?.kind === "strokes" ? count - 1 : count;
    const isOpen = (run: number) => run === onTop || run === drawn?.run;
    let runs = 0;
    layers.forEach((layer, index) => {
      // Above the input layer, whatever the item.
      const zIndex = String(index + 1);
      if (layer.kind === "strokes") {
        this.#paintRun(
          runs,
          layer.strokes,
          layer.erasedBy.map((stroke) => this.#strokes[stroke]),
          zIndex,
          isOpen(runs)
        );
        runs++;
      } else {
        const view = this.#layers[layer.kind].getView(layer.item.id);
        if (view) {
          view.element.style.zIndex = zIndex;
        }
      }
    });
    // A stroke on top of everything, being drawn, starts a run of its own.
    if (drawn?.run !== null && drawn?.run === runs) {
      this.#paintRun(runs++, [], [], String(layers.length + 1), true);
    }
    // The first canvas stays, even with no strokes, ready for some.
    if (runs === 0) {
      this.#paintRun(runs++, [], [], "1", true);
    }
    for (const run of this.#runs.splice(runs)) {
      run.canvas.remove();
    }
    // Keep a stroke in progress, e.g. if the window resizes mid-stroke.
    if (drawn && !drawn.note) {
      for (const context of this.#getDrawnContexts(drawn)) {
        drawStroke(context, drawn.stroke);
      }
    }
  }

  // Draws the fills on their canvas, below everything, over what the canvas
  // shows, with the erasers after them.
  #paintFills(): void {
    const fills = this.#fills;
    if (fills.length === 0) {
      this.#fillCanvas?.remove();
      this.#fillCanvas = null;
      this.#paintedFills = null;
      return;
    }
    let canvas = this.#fillCanvas;
    if (!canvas) {
      canvas = createElement("canvas", "canvas-fills");
      this.#items.prepend(canvas);
      this.#fillCanvas = canvas;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const width = this.#width;
    const height = this.#height;
    const pixelRatio = window.devicePixelRatio || 1;
    const viewport = this.#viewport;
    // Only erasers change how fills look.
    const erasers = this.#strokes.filter(({ color }) => color === undefined);
    const painted = this.#paintedFills;
    this.#paintedFills = {
      fills,
      erasers,
      width,
      height,
      pixelRatio,
      viewport,
    };
    if (
      painted &&
      painted.fills === fills &&
      isSame(painted.erasers, erasers) &&
      painted.width === width &&
      painted.height === height &&
      painted.pixelRatio === pixelRatio &&
      painted.viewport === viewport
    ) {
      return;
    }
    placeOnScreen(canvas, viewport, { x: 0, y: 0, width, height });
    const { zoom } = viewport;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    const scale = pixelRatio * zoom;
    context.setTransform(
      scale,
      0,
      0,
      scale,
      -viewport.x * scale,
      -viewport.y * scale
    );
    drawFills(context, fills, this.#strokes);
  }

  // Draws a run of strokes on its canvas, and the erasers above them. Strokes
  // that were only added, e.g. by redo, are drawn on top. An open run, which
  // strokes can be added to, covers what the canvas shows.
  #paintRun(
    index: number,
    strokes: Stroke[],
    erasers: Stroke[],
    zIndex: string,
    open: boolean
  ): void {
    let run = this.#runs[index];
    if (!run) {
      run = {
        canvas: createElement("canvas", "canvas-drawing"),
        painted: null,
      };
      this.#runs[index] = run;
      this.#items.append(run.canvas);
    }
    const { canvas } = run;
    canvas.style.zIndex = zIndex;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const area = this.#getRunArea(strokes, open);
    const pixelRatio = window.devicePixelRatio || 1;
    const viewport = this.#viewport;
    const painted = run.painted;
    run.painted = { area, pixelRatio, viewport, strokes, erasers };
    if (
      painted &&
      isSameBox(painted.area, area) &&
      painted.pixelRatio === pixelRatio &&
      painted.viewport === viewport &&
      isSame(painted.erasers, erasers) &&
      startsWith(strokes, painted.strokes) &&
      // A stroke added below an eraser would be drawn over it.
      (erasers.length === 0 || strokes.length === painted.strokes.length)
    ) {
      for (const stroke of strokes.slice(painted.strokes.length)) {
        drawStroke(context, stroke);
      }
      return;
    }

    // Everything is drawn again, at the screen's resolution, through the
    // viewport. Resizing clears it, and otherwise it's cleared.
    const { zoom } = viewport;
    placeOnScreen(canvas, viewport, area);
    const pixelWidth = Math.round(area.width * pixelRatio);
    const pixelHeight = Math.round(area.height * pixelRatio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    } else {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, pixelWidth, pixelHeight);
    }
    if (pixelWidth === 0 || pixelHeight === 0) {
      return;
    }
    const scale = pixelRatio * zoom;
    context.setTransform(
      scale,
      0,
      0,
      scale,
      -(viewport.x * zoom + area.x) * pixelRatio,
      -(viewport.y * zoom + area.y) * pixelRatio
    );
    for (const stroke of [...strokes, ...erasers]) {
      drawStroke(context, stroke);
    }
  }

  // Where a run's canvas goes, in whole screen pixels from the canvas's top
  // left: over everything the canvas shows if it's open, or else around its
  // strokes, within that. Erasers only take away, so they don't count.
  #getRunArea(strokes: Stroke[], open: boolean): Box {
    const width = this.#width;
    const height = this.#height;
    if (open) {
      return { x: 0, y: 0, width, height };
    }
    const box = unionBoxes(
      strokes.flatMap((stroke) =>
        stroke.color === undefined ? [] : (getCachedStrokeBox(stroke) ?? [])
      )
    );
    if (!box) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const { x, y, zoom } = this.#viewport;
    const clamp = (value: number, max: number) =>
      Math.min(max, Math.max(0, value));
    const left = clamp(Math.floor((box.x - x) * zoom), width);
    const top = clamp(Math.floor((box.y - y) * zoom), height);
    const right = clamp(Math.ceil((box.x + box.width - x) * zoom), width);
    const bottom = clamp(Math.ceil((box.y + box.height - y) * zoom), height);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  // Draws a note's strokes and fills on its own canvases, once it has
  // some, clipped to it: its fills below its text, and its strokes above.
  // As few pixels as look sharp at the zoom, within what a browser can draw.
  #paintInk(view: NoteView): void {
    const { item, editor } = view;
    const scale = Math.min(
      this.#viewport.zoom * (window.devicePixelRatio || 1),
      Math.sqrt(MAX_INK_PIXELS / (item.width * item.height))
    );
    const width = Math.max(1, Math.round(item.width * scale));
    const height = Math.max(1, Math.round(item.height * scale));
    const inked: Inked = {
      strokes: item.strokes,
      fills: item.fills,
      width,
      height,
    };
    if (!view.ink && item.strokes.length > 0) {
      view.ink = createElement("canvas", "canvas-note-ink");
      editor.element.after(view.ink);
    }
    if (view.ink) {
      const before = view.inked;
      view.inked = inked;
      this.#paintNoteCanvas(view.ink, item, inked, before, "strokes");
    }
    if (!view.fillCanvas && item.fills.length > 0) {
      view.fillCanvas = createElement("canvas", "canvas-note-fills");
      editor.element.before(view.fillCanvas);
    }
    if (view.fillCanvas) {
      const before = view.filled;
      view.filled = inked;
      this.#paintNoteCanvas(view.fillCanvas, item, inked, before, "fills");
    }
  }

  // Draws a note's strokes, or its fills, on one of its canvases, from its
  // top left corner, unless they're already drawn. Strokes added since,
  // e.g. one just drawn, are drawn on top instead. Of those, only erasers
  // change its fills, and they erase every fill before them.
  #paintNoteCanvas(
    canvas: HTMLCanvasElement,
    note: Note,
    inked: Inked,
    before: Inked | null,
    what: "strokes" | "fills"
  ): void {
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const { width, height, strokes, fills } = inked;
    if (
      before &&
      before.width === width &&
      before.height === height &&
      before.fills === fills &&
      startsWith(strokes, before.strokes)
    ) {
      for (const stroke of strokes.slice(before.strokes.length)) {
        if (what === "strokes" || stroke.color === undefined) {
          drawStroke(context, stroke);
        }
      }
      return;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    } else {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, width, height);
    }
    context.setTransform(width / note.width, 0, 0, height / note.height, 0, 0);
    if (what === "fills") {
      drawFills(context, fills, strokes);
      return;
    }
    for (const stroke of strokes) {
      drawStroke(context, stroke);
    }
  }

  // Where the stroke being drawn shows as it's drawn: its note, the run it's
  // part of, or every run for the eraser.
  // The eraser erases fills too.
  #getDrawnContexts({ stroke, run, note }: Drawn): CanvasRenderingContext2D[] {
    const erasing = stroke.color === undefined;
    const canvases = note
      ? [note.ink, erasing ? note.fillCanvas : null]
      : run === null
        ? [...this.#runs.map(({ canvas }) => canvas), this.#fillCanvas]
        : [this.#runs[run]?.canvas];
    return canvases.flatMap((canvas) => canvas?.getContext("2d") ?? []);
  }

  #getPoint(event: PointerEvent): Point {
    return this.getDrawingPoint(event.clientX, event.clientY);
  }

  #moveCursor(event: PointerEvent): void {
    const cursor = this.#cursor;
    // Touch and pen have no hover position, so the cursor only follows a
    // mouse. Placing, moving and filling have no size to show.
    if (
      event.pointerType !== "mouse" ||
      this.#placing ||
      this.#moving ||
      this.#filling
    ) {
      cursor.style.visibility = "hidden";
      return;
    }
    const { x, y } = this.#toCanvasPoint(event.clientX, event.clientY);
    // The tool's size is in drawing units, so it's shown at the zoom.
    const size = this.#toolState.size * 2 * this.#viewport.zoom;
    cursor.style.visibility = "visible";
    cursor.style.left = px(x);
    cursor.style.top = px(y);
    cursor.style.width = px(size);
    cursor.style.height = px(size);
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }
    // An item is placed on release instead, since focusing it now would be
    // undone as the press moves focus.
    if (this.#placing) {
      const active = document.activeElement;
      this.#placesOnRelease =
        !this.#items.contains(active) && !this.#overlay.contains(active);
      return;
    }
    if (this.#filling) {
      void this.#fillAt(event.clientX, event.clientY);
      return;
    }
    const { color, size } = this.#toolState;
    const point = this.#getPoint(event);
    // A stroke started on a note is drawn on it, from its top left corner.
    const note = this.#getNoteAt(event.clientX, event.clientY);
    const origin = note?.item ?? { x: 0, y: 0 };
    const stroke: Stroke = {
      color:
        color === undefined
          ? undefined
          : resolveColor(this.#interfaceLayer, color),
      points: [{ x: point.x - origin.x, y: point.y - origin.y }],
      size,
    };
    // A stroke on the drawing is part of the run of strokes on top, or
    // starts one above everything.
    const runs = this.#order.filter(({ kind }) => kind === "strokes").length;
    const onTop = this.#order.at(-1)?.kind === "strokes";
    const drawn: Drawn = {
      stroke,
      run: note || stroke.color === undefined ? null : onTop ? runs - 1 : runs,
      note,
    };
    this.#drawn = drawn;
    if (note && !note.ink) {
      // Its first stroke, which needs a canvas.
      note.ink = createElement("canvas", "canvas-note-ink");
      note.editor.element.after(note.ink);
      this.#paintInk(note);
    } else if (!note && drawn.run === runs) {
      this.#paint();
    }
    // Capture keeps the stroke going if the pointer leaves the canvas.
    this.#interfaceLayer.setPointerCapture(event.pointerId);
    for (const context of this.#getDrawnContexts(drawn)) {
      drawStroke(context, stroke);
    }
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (!event.isPrimary) {
      return;
    }
    this.#moveCursor(event);
    const drawn = this.#drawn;
    if (!drawn) {
      return;
    }
    const { stroke, note } = drawn;
    const point = this.#getPoint(event);
    const origin = note?.item ?? { x: 0, y: 0 };
    stroke.points.push({ x: point.x - origin.x, y: point.y - origin.y });
    for (const context of this.#getDrawnContexts(drawn)) {
      drawStroke(context, stroke, stroke.points.length - 2);
    }
  };

  #onPointerUp = (event: PointerEvent): void => {
    if (this.#placesOnRelease && event.isPrimary) {
      this.#placesOnRelease = false;
      if (event.type === "pointerup" && this.#placing) {
        this.#placeDraft(this.#getPoint(event), this.#placing);
      }
      return;
    }
    const drawn = this.#drawn;
    if (!event.isPrimary || !drawn) {
      return;
    }
    this.#drawn = null;
    const { stroke, run, note } = drawn;
    if (note) {
      const strokes = [...note.item.strokes, stroke];
      // It's already drawn, so it isn't drawn again once it's added.
      if (note.inked) {
        note.inked = { ...note.inked, strokes };
      }
      this.#options.onItemChange("notes", { ...note.item, strokes });
      return;
    }
    const painted = run === null ? null : this.#runs[run]?.painted;
    if (painted) {
      painted.strokes = [...painted.strokes, stroke];
    }
    this.#options.onStrokeComplete(stroke);
  };

  // Fills the area around a point on screen with the pencil's color: the
  // pixels around it that look the same, as the drawing's drawn, up to the
  // lines and edges around them. On a note, it's the note's. An area that
  // goes past the canvas's edges, around everything, is the background, so
  // it fills that instead. Images aren't filled.
  async #fillAt(clientX: number, clientY: number): Promise<void> {
    const target = this.#getItemAt(clientX, clientY, ["images", "notes"]);
    const color = this.#toolState.color;
    if (this.#findingFill || target?.kind === "images" || !color) {
      return;
    }
    const note = target
      ? (this.#layers.notes.getView(target.view.item.id) ?? null)
      : null;
    const point = this.getDrawingPoint(clientX, clientY);
    // What's searched: a little more than what's shown, and only the note
    // on one.
    const visible = this.visibleArea;
    const { margin, maxPixels, tolerance, grow, smoothing } = FILL_LAYOUT;
    let area: Box = {
      x: visible.x - visible.width * margin,
      y: visible.y - visible.height * margin,
      width: visible.width * (1 + margin * 2),
      height: visible.height * (1 + margin * 2),
    };
    if (note) {
      area = intersectBoxes(area, note.item) ?? area;
    }
    const scale = Math.min(
      this.#viewport.zoom,
      Math.sqrt(maxPixels / (area.width * area.height))
    );
    this.#findingFill = true;
    try {
      const { drawing, textStyle, files } = await this.#getRendering();
      const image = await renderDrawing(
        drawing,
        area,
        scale,
        this.#background,
        textStyle,
        files
      );
      const context = image?.getContext("2d");
      if (!image || !context) {
        return;
      }
      const { width, height } = image;
      const { data } = context.getImageData(0, 0, width, height);
      const seed = {
        x: Math.min(width - 1, Math.floor((point.x - area.x) * scale)),
        y: Math.min(height - 1, Math.floor((point.y - area.y) * scale)),
      };
      const pressed = data.slice(
        (seed.y * width + seed.x) * 4,
        (seed.y * width + seed.x) * 4 + 3
      );
      const fillColor = resolveColor(this.#interfaceLayer, color);
      const isNear = (channels: ArrayLike<number> | null) =>
        channels !== null &&
        [0, 1, 2].every(
          (channel) =>
            Math.abs(channels[channel] - pressed[channel]) <= tolerance
        );
      // It's that color already.
      if (isNear(parseColor(fillColor))) {
        return;
      }
      const mask = floodFill(data, width, height, seed, tolerance);
      // Only areas closed in by lines are filled, so a stray click doesn't
      // fill everything: not one that goes past what's searched, around
      // everything, or, on a note, to its edges.
      if (touchesEdge(mask)) {
        this.#options.onNothingToFill();
        return;
      }
      // From the note's top left corner, on one, like its strokes.
      const origin = note?.item ?? { x: 0, y: 0 };
      const toDrawing = (value: number, start: number, from: number) =>
        Math.round((start + value / scale - from) * 100) / 100;
      const rings = traceMask(growMask(mask, grow)).map((ring) =>
        simplifyRing(ring, smoothing).map(({ x, y }) => ({
          x: toDrawing(x, area.x, origin.x),
          y: toDrawing(y, area.y, origin.y),
        }))
      );
      if (note) {
        const fill = {
          color: fillColor,
          rings,
          after: note.item.strokes.length,
        };
        this.#options.onItemChange("notes", {
          ...note.item,
          fills: [...note.item.fills, fill],
        });
      } else {
        this.#options.onFill({
          color: fillColor,
          rings,
          after: this.#strokes.length,
        });
      }
    } finally {
      this.#findingFill = false;
    }
  }

  // The note a stroke started at a point on screen is drawn on: the top one
  // there, unless an image is above it. Text is see-through, so it's
  // skipped.
  #getNoteAt(clientX: number, clientY: number): NoteView | null {
    const item = this.#getItemAt(clientX, clientY, ["images", "notes"]);
    return item?.kind === "notes"
      ? (this.#layers.notes.getView(item.view.item.id) ?? null)
      : null;
  }

  // The top item of `kinds` at a point on screen, if any.
  #getItemAt(
    clientX: number,
    clientY: number,
    kinds: ItemKind[] = ["images", "texts", "notes"]
  ): { kind: ItemKind; view: ItemView<PlacedItem> } | null {
    for (const layer of [...this.#order].reverse()) {
      if (layer.kind === "strokes" || !kinds.includes(layer.kind)) {
        continue;
      }
      const view = this.#layers[layer.kind].getView(layer.id);
      const box = view?.element.getBoundingClientRect();
      if (
        view &&
        box &&
        clientX >= box.left &&
        clientX <= box.right &&
        clientY >= box.top &&
        clientY <= box.bottom
      ) {
        return { kind: layer.kind, view };
      }
    }
    return null;
  }

  #onPointerLeave = (): void => {
    this.#cursor.style.visibility = "hidden";
  };

  // A point on screen, in pixels from the canvas's top left.
  #toCanvasPoint(clientX: number, clientY: number): Point {
    const { left, top } = this.#surface.getBoundingClientRect();
    return { x: clientX - left, y: clientY - top };
  }

  // Shows the drawing through the viewport: the strokes are drawn again, and
  // the items moved and scaled with CSS.
  #applyViewport(): void {
    const { x, y, zoom } = this.#viewport;
    this.#items.style.transform = `scale(${zoom}) translate(${-x}px, ${-y}px)`;
    // Lets items keep their handles the same size on screen.
    this.#items.style.setProperty("--canvas-zoom", String(zoom));
    this.#paint();
    for (const note of this.#layers.notes.views) {
      this.#paintInk(note);
    }
    this.#placeFormatBar();
  }

  // A change the person made, e.g. by scrolling, which the host is told of.
  #changeViewport(viewport: Viewport): void {
    this.setViewport(viewport);
    this.#options.onViewportChange(viewport);
  }

  #zoomAtCenter(zoom: number): void {
    this.#changeViewport(
      zoomAround(this.#viewport, zoom, {
        x: this.#width / 2,
        y: this.#height / 2,
      })
    );
  }

  // Scrolling pans, and Ctrl+scroll or pinching a trackpad, which browsers
  // send as Ctrl+scroll, zooms around the pointer.
  #onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    // Lines and pages, e.g. from some mice, as pixels.
    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? this.#height
          : 1;
    const dx = event.deltaX * unit;
    const dy = event.deltaY * unit;
    if (event.ctrlKey || event.metaKey) {
      const zoom = this.#viewport.zoom * Math.exp(-dy * ZOOM.wheelSpeed);
      this.#changeViewport(
        zoomAround(
          this.#viewport,
          zoom,
          this.#toCanvasPoint(event.clientX, event.clientY)
        )
      );
    } else if (event.shiftKey && dx === 0) {
      // A mouse wheel with Shift held scrolls sideways.
      this.#changeViewport(panBy(this.#viewport, -dy, 0));
    } else {
      this.#changeViewport(panBy(this.#viewport, -dx, -dy));
    }
  };

  /**
   * Pinching or Ctrl+scrolling over `element`, e.g. the toolbars around the
   * canvas, zooms the drawing too, rather than the browser zooming the page,
   * which can leave the toolbars off screen.
   */
  zoomOnPinch(element: HTMLElement): void {
    // The drawing handles its own.
    const isOutside = (event: Event) =>
      !this.#surface.contains(event.target as Node);
    element.addEventListener("gesturestart", (event) => {
      if (isOutside(event)) {
        this.#onGestureStart(event);
      }
    });
    element.addEventListener("gesturechange", (event) => {
      if (isOutside(event)) {
        this.#onGestureChange(event);
      }
    });
    // Plain scrolling is left alone, e.g. to scroll a menu.
    element.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey && isOutside(event)) {
          this.#onWheel(event);
        }
      },
      { passive: false }
    );
  }

  #onGestureStart = (event: Event): void => {
    event.preventDefault();
    this.#gestureZoom = this.#viewport.zoom;
  };

  #onGestureChange = (event: Event): void => {
    event.preventDefault();
    const gesture = event as GestureEvent;
    this.#changeViewport(
      zoomAround(
        this.#viewport,
        this.#gestureZoom * gesture.scale,
        this.#toCanvasPoint(gesture.clientX, gesture.clientY)
      )
    );
  };

  // Holding Space makes dragging pan, unless it's typed into something. A
  // focused button keeps Space unless the pointer is over the drawing.
  #onSpace = (event: KeyboardEvent): void => {
    if (event.code !== "Space") {
      return;
    }
    if (event.type === "keyup") {
      if (this.#spaceHeld) {
        // A button would act on it now.
        event.preventDefault();
        this.#spaceHeld = false;
        this.#surface.toggleAttribute("data-panning", this.#pan !== null);
      }
      return;
    }
    const target = event.target as Element | null;
    const isButton = Boolean(target?.closest?.("button, a"));
    if (isField(target) || (isButton && !this.#hovered)) {
      return;
    }
    // Space would otherwise scroll the page, or press the button.
    event.preventDefault();
    this.#spaceHeld = true;
    this.#surface.toggleAttribute("data-panning", true);
  };

  #onWindowBlur = (): void => {
    this.#spaceHeld = false;
    this.#surface.toggleAttribute("data-panning", this.#pan !== null);
  };

  // Stops the stroke being drawn, e.g. once a second finger touches.
  #cancelStroke(): void {
    const drawn = this.#drawn;
    if (!drawn) {
      return;
    }
    this.#drawn = null;
    if (drawn.note) {
      drawn.note.inked = null;
      drawn.note.filled = null;
      this.#paintInk(drawn.note);
      return;
    }
    for (const run of this.#runs) {
      run.painted = null;
    }
    this.#paintedFills = null;
    this.#paint();
  }

  // Two fingers' middle, and how far apart they are.
  #measurePinch(): { center: Point; distance: number } {
    const [a, b] = [...this.#touches.values()];
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  // The middle button, or the left with Space held, pans. A second finger
  // on a touch screen pinches to zoom and pans, instead of drawing.
  #onSurfaceDown = (event: PointerEvent): void => {
    if (event.pointerType === "touch") {
      this.#touches.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (this.#touches.size === 2) {
        this.#cancelStroke();
        this.#pan = null;
        this.#placesOnRelease = false;
        for (const layer of Object.values(this.#layers)) {
          layer.cancelGesture();
        }
        this.#pinch = this.#measurePinch();
      }
      if (this.#pinch) {
        event.stopPropagation();
      }
      if (this.#pinch || !this.#isMovePan(event)) {
        return;
      }
    }
    if (
      event.button === 1 ||
      (event.button === 0 && (this.#spaceHeld || this.#isMovePan(event)))
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.#surface.setPointerCapture(event.pointerId);
      this.#pan = {
        pointerId: event.pointerId,
        last: { x: event.clientX, y: event.clientY },
      };
      this.#surface.toggleAttribute("data-panning", true);
    }
  };

  // With the move tool, dragging anywhere but an item pans, and leaves the
  // item that was picked.
  #isMovePan(event: PointerEvent): boolean {
    if (!this.#moving || event.target !== this.#interfaceLayer) {
      return false;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.#items.contains(active)) {
      active.blur();
    }
    return true;
  }

  #onSurfaceMove = (event: PointerEvent): void => {
    if (this.#touches.has(event.pointerId)) {
      this.#touches.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }
    const pinch = this.#pinch;
    if (pinch && this.#touches.size >= 2) {
      event.stopPropagation();
      const next = this.#measurePinch();
      const panned = panBy(
        this.#viewport,
        next.center.x - pinch.center.x,
        next.center.y - pinch.center.y
      );
      this.#changeViewport(
        zoomAround(
          panned,
          panned.zoom * (next.distance / Math.max(pinch.distance, 1)),
          this.#toCanvasPoint(next.center.x, next.center.y)
        )
      );
      this.#pinch = next;
      return;
    }
    const pan = this.#pan;
    if (pan && event.pointerId === pan.pointerId) {
      event.stopPropagation();
      this.#changeViewport(
        panBy(
          this.#viewport,
          event.clientX - pan.last.x,
          event.clientY - pan.last.y
        )
      );
      pan.last = { x: event.clientX, y: event.clientY };
    }
  };

  #onSurfaceUp = (event: PointerEvent): void => {
    if (this.#touches.delete(event.pointerId) && this.#pinch) {
      // The fingers left after a pinch don't draw, until all are lifted.
      event.stopPropagation();
      if (this.#touches.size === 0) {
        this.#pinch = null;
      }
      return;
    }
    if (this.#pan?.pointerId === event.pointerId) {
      event.stopPropagation();
      this.#pan = null;
      this.#surface.toggleAttribute("data-panning", this.#spaceHeld);
    }
  };

  // A note centered where the canvas was pressed, or text starting there,
  // ready to type in.
  #placeDraft(point: Point, placing: Placing): void {
    const color = resolveColor(this.#interfaceLayer, placing.color);
    // Above everything, as it will be once it's added.
    const zIndex = String(this.#order.length + 1);
    if (placing.kind === "notes") {
      const { size } = NOTE_LAYOUT;
      const view = this.#layers.notes.addDraft({
        id: createId(),
        x: point.x - size / 2,
        y: point.y - size / 2,
        width: size,
        height: size,
        color: getNoteColor(color),
        content: [{ runs: [] }],
        strokes: [],
        fills: [],
      });
      view.element.style.zIndex = zIndex;
      this.#startEditing("notes", view);
      return;
    }
    const { fontSize } = placing;
    const view = this.#layers.texts.addDraft({
      id: createId(),
      x: point.x,
      // The first line is centered on the press.
      y: point.y - (fontSize * TEXT_LAYOUT.lineHeight) / 2,
      width: null,
      height: null,
      fontSize,
      color,
      content: [{ runs: [] }],
    });
    view.element.style.zIndex = zIndex;
    this.#startEditing("texts", view);
  }

  #getLayer(kind: TypedKind): ItemLayer<TypedItem, TypedView<TypedItem>> {
    return this.#layers[kind] as unknown as ItemLayer<
      TypedItem,
      TypedView<TypedItem>
    >;
  }

  // The text's own size and color, which the format bar goes back to.
  #getTextDefaults(kind: TypedKind, item: TypedItem) {
    if (kind === "texts") {
      const { fontSize, color } = item as TextBox;
      return { fontSize, color };
    }
    return {
      fontSize: NOTE_LAYOUT.fontSize,
      color: getCssVariable(this.#interfaceLayer, "--canvas-color-note-text"),
    };
  }

  #startEditing<T extends TypedItem>(
    kind: TypedKind,
    view: TypedView<T>
  ): void {
    const typed = view as unknown as TypedView<TypedItem>;
    if (this.#editing?.view === typed) {
      view.editor.focus();
      return;
    }
    this.#finishEditing();
    this.#closeMenu();
    this.#editing = { kind, view: typed, from: view.item };
    view.element.toggleAttribute("data-editing", true);
    this.#showEmpty(typed);
    view.editor.edit();
    // Only an editor that formats text has a format bar.
    const { formatting } = view.editor;
    if (formatting) {
      this.#formatBar.open(
        formatting,
        () => view.editor.focus(),
        this.#getTextDefaults(kind, view.item),
        this.#interfaceLayer
      );
      this.#placeFormatBar();
    }
  }

  // Keeps what was typed. A note or text left empty is removed, and a new
  // one is only added once it has text, so a stray click doesn't leave one.
  #finishEditing(): void {
    const editing = this.#editing;
    if (!editing) {
      return;
    }
    this.#editing = null;
    const { kind, view } = editing;
    this.#formatBar.close();
    view.element.removeAttribute("data-editing");
    view.editor.stopEditing();
    view.element.removeAttribute("data-empty");
    // Text past a note's bottom isn't shown, so it shows its start again.
    view.editor.element.scrollTop = 0;
    const layer = this.#getLayer(kind);
    const content = view.editor.content;
    const blank = isBlank(content);
    const item = { ...view.item, content };
    if (layer.isDraft(item.id)) {
      layer.endDraft(!blank);
      if (!blank) {
        this.#options.onItemAdd(kind, item as never);
      }
    } else if (blank) {
      this.#options.onItemRemove(kind, item.id);
    } else if (JSON.stringify(item) !== JSON.stringify(editing.from)) {
      // Its text, or its color, changed.
      this.#options.onItemChange(kind, item as never);
    }
  }

  // An empty text box shows a hint, and is wide enough to find again.
  #showEmpty({ element, editor }: TypedView<TypedItem>): void {
    element.toggleAttribute(
      "data-empty",
      editor.isEditable && isBlank(editor.content)
    );
  }

  /** Whether a note or text box is being typed in. */
  get isTyping(): boolean {
    return this.#editing !== null;
  }

  /**
   * Colors what's being typed: the selection, or what's typed next, with an
   * editor that formats text, or else a text box's text.
   */
  colorTyping(color: string): void {
    const editing = this.#editing;
    if (!editing) {
      return;
    }
    const { formatting } = editing.view.editor;
    if (formatting) {
      formatting.setValue("color", color);
      this.#formatBar.update();
    } else if (editing.kind === "texts") {
      const box: TextBox = { ...(editing.view.item as TextBox), color };
      editing.view.item = box;
      editing.view.element.style.color = color;
    }
  }

  /** Puts focus back in what's being typed, e.g. once a color's picked. */
  focusTyping(): void {
    this.#editing?.view.editor.focus();
  }

  // Typing goes on while focus is in the text or the format bar.
  #onEditingFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    const editing = this.#editing;
    // Some controls color the text, so typing goes on while they're used.
    const keepsTyping =
      next instanceof Element && next.closest("[data-canvas-keeps-typing]");
    if (
      editing &&
      !keepsTyping &&
      !(next && editing.view.element.contains(next)) &&
      !(next && this.#formatBar.element.contains(next))
    ) {
      this.#finishEditing();
    }
  };

  #placeFormatBar(): void {
    const editing = this.#editing;
    if (editing) {
      this.#formatBar.place(
        editing.view.element.getBoundingClientRect(),
        this.#overlay.getBoundingClientRect()
      );
    }
  }

  // The editor that shows a note's or text box's text, and is typed in.
  #createEditor(kind: TypedKind, item: TypedItem, label: string): TextEditor {
    const editor = this.#options.createTextEditor(item.content, {
      className: kind === "notes" ? "canvas-note-text" : "canvas-text-text",
      label,
      onUpdate: () => {
        const editing = this.#editing;
        if (editing?.view.editor === editor) {
          this.#showEmpty(editing.view);
          this.#formatBar.update();
          this.#placeFormatBar();
        }
      },
    });
    editor.element.addEventListener("focusout", this.#onEditingFocusOut);
    // Escape stops typing, leaving focus on the note or text box.
    editor.element.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const element = this.#editing?.view.element;
        this.#finishEditing();
        element?.focus();
      }
    });
    return editor;
  }

  // Pressing text while it's being typed in moves the cursor. With the move
  // tool, pressing it picks it, and pressing it twice opens it for typing.
  // With the note or text tool, pressing it opens it.
  #typingOptions<T extends TypedItem>(kind: TypedKind) {
    return {
      isPressForBrowser: (view: TypedView<T>, target: Element) =>
        view.editor.isEditable && view.editor.element.contains(target),
      onPress: (view: TypedView<T>) => {
        if (this.#moving) {
          view.element.focus();
        } else {
          this.#startEditing(kind, view);
        }
      },
      onOpen: (view: TypedView<T>) => this.#startEditing(kind, view),
      onMenu: (view: TypedView<T>, point: Point) =>
        this.#openItemMenu(kind, view, point),
      destroyView: (view: TypedView<T>) => view.editor.destroy(),
    };
  }

  // An item's menu: to move it to the front or back of everything, or
  // delete it. One being added has no place in the order yet.
  #openItemMenu(
    kind: ItemKind,
    view: ItemView<PlacedItem>,
    point: Point
  ): void {
    const { id } = view.item;
    const placed = this.#order.some(
      (layer) => layer.kind === kind && layer.id === id
    );
    const restack = (to: Restack, label: string): MenuAction => ({
      label,
      disabled: !placed || isAtEdge(this.#order, kind, id, to),
      onSelect: () => this.#options.onItemRestack(kind, id, to),
    });
    this.#openMenu(point, [
      restack("front", "Bring to front"),
      restack("back", "Send to back"),
      { label: "Delete", onSelect: () => this.#delete(kind, view) },
    ]);
  }

  // Items only take pointer input with the tools that move or open them, so
  // a right-click over one otherwise reaches the drawing, and opens the top
  // item's menu.
  #onLayerContextMenu = (event: MouseEvent): void => {
    const found = this.#getItemAt(event.clientX, event.clientY);
    if (found) {
      this.#openItemMenu(found.kind, found.view, {
        x: event.clientX,
        y: event.clientY,
      });
    }
  };

  // Deleting what's being typed in throws the typing away.
  #delete(kind: ItemKind, view: ItemView<PlacedItem>): void {
    if (this.#editing?.view === view) {
      this.#editing = null;
      this.#formatBar.close();
    }
    (
      this.#layers[kind] as unknown as ItemLayer<
        PlacedItem,
        ItemView<PlacedItem>
      >
    ).remove(view.item.id);
  }

  // Opens a menu of `actions` at `point` on screen, inside the canvas.
  #openMenu(point: Point, actions: MenuAction[]): void {
    this.#closeMenu();
    const menu = createElement("div", "canvas-menu canvas-context-menu");
    menu.setAttribute("role", "menu");
    for (const { label, onSelect, disabled = false } of actions) {
      const item = createElement("button", "canvas-menu-item");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.textContent = label;
      item.disabled = disabled;
      item.addEventListener("click", () => {
        this.#closeMenu();
        onSelect();
      });
      menu.append(item);
    }
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        this.#closeMenu();
      }
    });
    // Safari doesn't focus a button that's clicked, so pressing one would
    // take focus out of the menu and close it before the click.
    menu.addEventListener("mousedown", (event) => event.preventDefault());
    menu.addEventListener("focusout", (event) => {
      if (!menu.contains(event.relatedTarget as Node | null)) {
        this.#closeMenu();
      }
    });
    this.#overlay.append(menu);
    this.#menu = menu;
    const bounds = this.#overlay.getBoundingClientRect();
    const left = Math.min(
      point.x - bounds.left,
      bounds.width - menu.offsetWidth - 8
    );
    const top = Math.min(
      point.y - bounds.top,
      bounds.height - menu.offsetHeight - 8
    );
    menu.style.left = px(Math.max(8, left));
    menu.style.top = px(Math.max(8, top));
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    document.addEventListener("pointerdown", this.#onDocumentPointerDown, true);
  }

  // Removing the menu takes focus from it, which would close it again, so
  // it's forgotten first.
  #closeMenu(): void {
    const menu = this.#menu;
    if (!menu) {
      return;
    }
    this.#menu = null;
    menu.remove();
    document.removeEventListener(
      "pointerdown",
      this.#onDocumentPointerDown,
      true
    );
  }

  #onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.#menu?.contains(event.target as Node)) {
      this.#closeMenu();
    }
  };

  // Strokes drawn on a note, and its fills, stay where they are on the
  // drawing as it's resized, rather than stretching, and only show inside
  // it.
  #createNoteLayer(): ItemLayer<Note, NoteView> {
    return new ItemLayer<Note, NoteView>("canvas-notes", {
      className: "canvas-note",
      getZoom: () => this.#viewport.zoom,
      handles: RESIZE_HANDLES,
      createView: (note, element) => {
        const editor = this.#createEditor("notes", note, "Sticky note");
        element.append(editor.element);
        return {
          element,
          item: note,
          editor,
          ink: null,
          inked: null,
          fillCanvas: null,
          filled: null,
        };
      },
      render: (view) => {
        const { element, item, editor } = view;
        element.style.left = px(item.x);
        element.style.top = px(item.y);
        element.style.width = px(item.width);
        element.style.height = px(item.height);
        element.style.backgroundColor = item.color;
        editor.setContent(item.content);
        this.#paintInk(view);
      },
      resize: (note, _size, handle, dx, dy, min) => {
        const box = resizeBox(note, handle, dx, dy, min);
        const shiftX = note.x - box.x;
        const shiftY = note.y - box.y;
        if (shiftX === 0 && shiftY === 0) {
          return { ...note, ...box };
        }
        const shift = ({ x, y }: Point) => ({ x: x + shiftX, y: y + shiftY });
        return {
          ...note,
          ...box,
          strokes: note.strokes.map((stroke) => ({
            ...stroke,
            points: stroke.points.map(shift),
          })),
          fills: note.fills.map((fill) => ({
            ...fill,
            rings: fill.rings.map((ring) => ring.map(shift)),
          })),
        };
      },
      getMinSize: () => ({
        width: NOTE_LAYOUT.minSize,
        height: NOTE_LAYOUT.minSize,
      }),
      ...this.#typingOptions<Note>("notes"),
      onChange: (note) => this.#options.onItemChange("notes", note),
      onRemove: (id) => this.#options.onItemRemove("notes", id),
    });
  }

  // Text is as wide as its longest line until its width is set, and at
  // least as tall as its text. Resizing it only resizes the box: the text
  // wraps at its new width.
  #createTextLayer(): ItemLayer<TextBox, TypedView<TextBox>> {
    return new ItemLayer<TextBox, TypedView<TextBox>>("canvas-texts", {
      className: "canvas-text",
      getZoom: () => this.#viewport.zoom,
      handles: RESIZE_HANDLES,
      createView: (box, element) => {
        const editor = this.#createEditor("texts", box, "Text");
        element.append(editor.element);
        return { element, item: box, editor };
      },
      render: ({ element, item, editor }) => {
        element.style.left = px(item.x);
        element.style.top = px(item.y);
        element.style.width =
          item.width === null ? "max-content" : px(item.width);
        element.style.minHeight = item.height === null ? "" : px(item.height);
        element.style.fontSize = px(item.fontSize);
        element.style.color = item.color;
        element.toggleAttribute("data-wraps", item.width !== null);
        editor.setContent(item.content);
      },
      // Only the sides the handle is on change, so text that's as wide as
      // its longest line stays that way when only its height changes.
      resize: (box, size, handle, dx, dy, min) => {
        const next = resizeBox({ ...box, ...size }, handle, dx, dy, min);
        return {
          ...box,
          x: next.x,
          y: next.y,
          width: /[ew]$/.test(handle) ? next.width : box.width,
          height: /^[ns]/.test(handle) ? next.height : box.height,
        };
      },
      // It can't be shorter than its text.
      getMinSize: ({ editor }) => ({
        width: TEXT_LAYOUT.minWidth,
        height: editor.element.offsetHeight,
      }),
      ...this.#typingOptions<TextBox>("texts"),
      onChange: (box) => this.#options.onItemChange("texts", box),
      onRemove: (id) => this.#options.onItemRemove("texts", id),
    });
  }

  // Images resize from their corners, keeping their shape.
  #createImageLayer(): ItemLayer<ImageItem, ImageView> {
    return new ItemLayer<ImageItem, ImageView>("canvas-images", {
      className: "canvas-image",
      getZoom: () => this.#viewport.zoom,
      handles: ["ne", "se", "sw", "nw"],
      createView: (item, element) => {
        element.setAttribute("role", "img");
        element.setAttribute("aria-label", "Image");
        const image = createElement("img", "canvas-image-file");
        image.alt = "";
        image.draggable = false;
        element.append(image);
        void this.#getImageUrl(item.id).then((url) => {
          if (url) {
            image.src = url;
          } else {
            element.toggleAttribute("data-missing", true);
          }
        });
        return { element, item, image };
      },
      render: ({ element, item }) => {
        element.style.left = px(item.x);
        element.style.top = px(item.y);
        element.style.width = px(item.width);
        element.style.height = px(item.height);
      },
      resize: (item, _size, handle, dx, dy) => ({
        ...item,
        ...resizeBoxKeepingShape(item, handle, dx, dy, IMAGE_LAYOUT.minSize),
      }),
      getMinSize: () => ({
        width: IMAGE_LAYOUT.minSize,
        height: IMAGE_LAYOUT.minSize,
      }),
      onPress: ({ element }) => element.focus(),
      onMenu: (view, point) => this.#openItemMenu("images", view, point),
      onChange: (item) => this.#options.onItemChange("images", item),
      onRemove: (id) => this.#options.onItemRemove("images", id),
    });
  }

  #getImageUrl(id: string): Promise<string | null> {
    let url = this.#imageUrls.get(id);
    if (!url) {
      url = this.#options
        .getImage(id)
        .then((blob) => (blob ? URL.createObjectURL(blob) : null));
      this.#imageUrls.set(id, url);
    }
    return url;
  }
}
