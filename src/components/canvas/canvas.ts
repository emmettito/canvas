import { DRAG_THRESHOLD } from "../../constants/drag-threshold.const";
import { FILL_LAYOUT } from "../../constants/fill-layout.const";
import { IMAGE_LAYOUT } from "../../constants/image-layout.const";
import { LOUPE_LAYOUT } from "../../constants/loupe-layout.const";
import { NOTE_LAYOUT } from "../../constants/note-layout.const";
import { NOTE_SNAP } from "../../constants/note-snap.const";
import { RESIZE_HANDLES } from "../../constants/resize-handles.const";
import { TEXT_LAYOUT } from "../../constants/text-layout.const";
import { ZOOM } from "../../constants/zoom.const";
import { type Activity } from "../../models/activity.model";
import { type Box } from "../../models/box.model";
import { type CustomColor, type ToolColor } from "../../models/color.model";
import {
  type Drawing,
  type DrawingItem,
  type ItemKind,
} from "../../models/drawing.model";
import { type DrawingChange } from "../../models/drawing-change.model";
import { type ExportOptions } from "../../models/export-options.model";
import { type Fill } from "../../models/fill.model";
import { type ImageItem } from "../../models/image-item.model";
import { type Layer } from "../../models/layer.model";
import { type Note } from "../../models/note.model";
import { type PersonName } from "../../models/person-name.model";
import { type Point } from "../../models/point.model";
import { type RichText } from "../../models/rich-text.model";
import { type Size } from "../../models/size.model";
import { type ResizeHandle } from "../../models/resize-handle.model";
import { type Stroke } from "../../models/stroke.model";
import { type TextBox } from "../../models/text-box.model";
import {
  type TextEditor,
  type TextEditorFactory,
} from "../../models/text-editor.model";
import { type ToolState } from "../../models/tool-state.model";
import { type Viewport } from "../../models/viewport.model";
import { type ColorFormat } from "../../utilities/color-formats";
import { createElement } from "../../utilities/create-element";
import { createId } from "../../utilities/create-id";
import { drawFills } from "../../utilities/draw-fills";
import { drawStroke } from "../../utilities/draw-stroke";
import {
  isCustomColor,
  isDarkColor,
  parseColor,
  resolveColor,
  splitAlpha,
  toHex,
  withAlpha,
} from "../../utilities/colors";
import { exportDrawing, renderDrawing } from "../../utilities/export-drawing";
import { getByline, getSignerNames } from "../../utilities/get-byline";
import { getCssVariable } from "../../utilities/get-css-variable";
import {
  floodFill,
  growMask,
  simplifyRing,
  touchesEdge,
  traceMask,
} from "../../utilities/flood-fill";
import { getNoteShade } from "../../utilities/palette-grid";
import { resizeBox, resizeBoxKeepingShape } from "../../utilities/resize-box";
import { isField } from "../../utilities/is-field";
import { snapBox, type SnapGuide } from "../../utilities/snap-box";
import { eraseStrokes, touchesFill } from "../../utilities/erase-strokes";
import {
  isAtEdge,
  isEraser,
  isStrokeAtEdge,
  type Restack,
  resolveLayers,
} from "../../utilities/layers";
import {
  isStrokeAt,
  isStrokeInBox,
  moveStroke,
  resizeStroke,
} from "../../utilities/stroke-shape";
import { isBlank, isEmpty } from "../../utilities/rich-text";
import {
  DEFAULT_VIEWPORT,
  fitViewport,
  getFillBox,
  getOpaqueBox,
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
import {
  ItemLayer,
  type ItemView,
  LONG_PRESS,
  type PlacedItem,
} from "./item-layer";
import { Loupe } from "./loupe";

import "./canvas.css";

export interface CanvasOptions {
  onStrokeComplete: (stroke: Stroke) => void;
  onItemAdd: <K extends ItemKind>(kind: K, item: DrawingItem<K>) => void;
  // An item was moved, resized or retyped.
  onItemChange: <K extends ItemKind>(kind: K, item: DrawingItem<K>) => void;
  onItemRemove: (kind: ItemKind, id: string) => void;
  // An item was brought to the front, or sent to the back.
  onItemRestack: (kind: ItemKind, id: string, to: Restack) => void;
  // Several items changed at once, e.g. everything picked was moved or
  // deleted, as one change to undo.
  onBatch: (changes: DrawingChange[]) => void;
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
  // Custom colors are to be written in `format` from now on.
  onColorFormat: (format: ColorFormat) => void;
  // What's being done changed, e.g. a stroke being drawn, or null once it's
  // done, after the change it made, so everyone drawing together sees it as
  // it happens.
  onActivity?: (activity: Activity | null) => void;
  // A note's being typed in, which is this color, or none is, with null.
  onEditingNote?: (color: string | null) => void;
}

/** An item, by its kind and id, e.g. one that's picked. */
export interface ItemRef {
  kind: ItemKind;
  id: string;
}

/**
 * A stroke, by its id: on the drawing, or on the note `note`, from its top
 * left corner. It can be what's left of an eraser, which only shows on fills.
 */
export interface StrokeRef {
  kind: "strokes";
  id: string;
  note: string | null;
}

/** Something that can be picked. */
export type PickRef = ItemRef | StrokeRef;

function getKey(ref: PickRef): string {
  return ref.kind === "strokes"
    ? `strokes:${ref.note ?? ""}:${ref.id}`
    : `${ref.kind}:${ref.id}`;
}

// How far from a stroke, on screen, a press still picks it.
const STROKE_SLACK = 4;

// The smallest a stroke can be resized to, on the drawing.
const MIN_STROKE_BOX = { width: 1, height: 1 };

// A stroke being moved, along with the rest of what's picked, or resized.
interface StrokeGesture {
  pointerId: number;
  start: Point;
  ref: StrokeRef;
  // The side or corner being dragged, or null to move it.
  handle: ResizeHandle | null;
  // Where the stroke was, for resizing.
  box: Box | null;
  moved: boolean;
  // Whether a press on one of several picked picks it alone, if it's only a
  // click.
  pickAlone: boolean;
  longPress: ReturnType<typeof setTimeout> | undefined;
}

function isOverlapping(a: DOMRect, b: Box): boolean {
  return (
    a.left <= b.x + b.width &&
    a.right >= b.x &&
    a.top <= b.y + b.height &&
    a.bottom >= b.y
  );
}

/** Someone drawing together with the canvas, as their activity shows. */
export interface ActivityPeer {
  id: string;
  // Their color, e.g. their pointer's.
  color: string;
}

/** What pressing the canvas places, instead of drawing. */
export type Placing =
  | { kind: "notes"; color: ToolColor; author: PersonName | null }
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
  erasers: Stroke[];
  width: number;
  height: number;
}

// A note, with the strokes drawn on it and its fills, which are only drawn
// on canvases of their own once it has some: its fills below its text, and
// its strokes above.
interface NoteView extends TypedView<Note> {
  // Who signed it, along its bottom, if anyone did.
  byline: HTMLElement | null;
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

// What's drawn on a run of strokes' canvas: its strokes, through the viewport,
// over `area`.
interface Painted {
  // In whole screen pixels from the canvas's top left.
  area: Box;
  pixelRatio: number;
  viewport: Viewport;
  strokes: Stroke[];
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

// The item an activity is moving or typing in.
function getActivityId(
  activity: Exclude<Activity, { type: "stroke" }>
): string {
  return activity.type === "move" ? activity.id : activity.item.id;
}

function isSameBox(a: Box, b: Box): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

// The same strokes or fills, in the same order, even if they're in a new
// array, e.g. once someone else's change is made.
function isSame<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && startsWith(a, b);
}

function startsWith<T>(strokes: T[], prefix: T[]): boolean {
  return (
    prefix.length <= strokes.length &&
    prefix.every((stroke, index) => stroke === strokes[index])
  );
}

// The most pixels a note's strokes are drawn with, so a big note zoomed in
// stays within what browsers can draw on one canvas.
const MAX_INK_PIXELS = 16_000_000;

// How far, in screen pixels, the pointer moves before a stroke gets another
// point, so a hand's tremble doesn't add a crowd of tiny pieces.
const MIN_POINT_GAP = 0.5;

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
  // Where a note would go, with the note tool, under the pointer.
  #noteGhost = createElement("div", "canvas-note-ghost");
  // How each person who's signed a note is shown in its byline.
  #signerName = getSignerNames([]);
  // The dropper's magnifier, and where the pointer is, on screen. Since
  // sampling takes a moment, whether it's being sampled, and whether it
  // needs sampling again, e.g. as the pointer moved meanwhile.
  #loupe = new Loupe();
  #loupeAt: Point | null = null;
  #sampling = false;
  #loupeStale = false;
  // The drawing's strokes and items, stacked in its order, above the input
  // layer, so items can take pointer input themselves.
  #items = createElement("div", "canvas-items");
  // The strokes others drawing together are drawing, until they're added.
  // It's only on the page while there are some.
  #peerInk = createElement("canvas", "canvas-peer-ink");
  #peerActivities = new Map<
    string,
    { peer: ActivityPeer; activity: Activity }
  >();
  // The drawing as it's shown: its background, strokes and items, and the
  // input on them. A theme can filter it, e.g. to show it dark.
  #surface = createElement("div", "canvas-surface");
  // Controls over the drawing, e.g. the format bar, which aren't filtered.
  #overlay = createElement("div", "canvas-overlay");
  // What a note being moved lined up with.
  #snapGuides = createElement("div", "canvas-snap-guides");
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
  // The press that places an item on release: where it started, on screen
  // and on the drawing, and the note it's sizing once it's dragged. Pressing
  // the canvas to stop typing in an item doesn't place one.
  #placingPress: {
    pointerId: number;
    client: Point;
    start: Point;
    note: NoteView | null;
  } | null = null;
  // The note or text being typed in, which the format bar formats.
  // `from` is the item as typing started, to tell if it changed.
  #editing: {
    kind: TypedKind;
    view: TypedView<TypedItem>;
    from: TypedItem;
  } | null = null;
  // What's being pressed, anywhere on the page, until it's let go.
  #pressed: Node | null = null;
  #formatBar = new FormatBar(
    (color) => this.#options.onCustomColor(color),
    (format) => this.#options.onColorFormat(format)
  );
  // An item's menu, while it's open.
  #menu: HTMLElement | null = null;
  // What's picked with the select tool, to move, delete or copy together, by
  // `getKey`. The item with focus is always one of them.
  #selection = new Map<string, PickRef>();
  // Strokes as they're shown while they're moved or resized, by their keys,
  // until the change is made.
  #shownStrokes = new Map<string, Stroke>();
  #strokeGesture: StrokeGesture | null = null;
  // Outlines of the strokes picked, which also take presses to drag them.
  #strokeBoxes = createElement("div", "canvas-stroke-boxes");
  // Set while focus moves to an item that's already picked, so it isn't
  // then the only one.
  #keepingSelection = false;
  // How far the item being dragged has moved, with everything else picked
  // moving along with it, until it's dropped.
  #groupMove: (ItemRef & { dx: number; dy: number }) | null = null;
  #erasers: Stroke[] = [];
  // A box dragged with the select tool, picking what it touches, on top of
  // what `before` keeps, which is what was picked with Shift held, and
  // nothing otherwise. `picked` is what was picked, to put back if it's
  // cancelled.
  #marquee: {
    pointerId: number;
    start: Point;
    before: Map<string, PickRef>;
    picked: Map<string, PickRef>;
    element: HTMLElement;
  } | null = null;
  #toolState: ToolState;
  #placing: Placing | null = null;
  // Whether pressing items moves them, with the select tool, rather than
  // drawing over them.
  #moving = false;
  // Whether dragging anywhere pans, with the hand.
  #hand = false;
  #options: CanvasOptions;
  #drawn: Drawn | null = null;
  // A see-through stroke being drawn shows on a canvas of its own until it's
  // done (see `#paintPreview`).
  #preview: HTMLCanvasElement | null = null;
  #viewport: Viewport = DEFAULT_VIEWPORT;
  #background = "#ffffff";
  // Whether signed notes show who signed them, on the canvas and as it's
  // drawn, e.g. exported.
  #showAuthors = true;
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
    const { fontSize, lineHeight, padding, cornerRadius, bylineSize } =
      NOTE_LAYOUT;
    const notes = this.#layers.notes.element.style;
    notes.fontSize = px(fontSize);
    notes.lineHeight = String(lineHeight);
    notes.setProperty("--canvas-note-padding", px(padding));
    notes.setProperty("--canvas-note-radius", px(cornerRadius));
    notes.setProperty("--canvas-note-byline-size", px(bylineSize));
    notes.setProperty(
      "--canvas-note-byline-height",
      px(bylineSize * lineHeight)
    );
    notes.setProperty(
      "--canvas-note-byline-opacity",
      String(NOTE_LAYOUT.bylineOpacity)
    );
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
    this.#items.addEventListener("focusin", this.#onItemFocus);
    this.#items.addEventListener("keydown", this.#onItemKeyDown);
    this.#peerInk.setAttribute("aria-hidden", "true");
    this.#surface.append(
      layer,
      this.#items,
      this.#strokeBoxes,
      this.#cursor,
      this.#noteGhost
    );
    this.#overlay.append(
      this.#snapGuides,
      this.#formatBar.element,
      this.#loupe.element
    );
    container.append(this.#surface, this.#overlay);

    const surface = this.#surface;
    surface.addEventListener("wheel", this.#onWheel, { passive: false });
    surface.addEventListener("gesturestart", this.#onGestureStart);
    surface.addEventListener("gesturechange", this.#onGestureChange);
    // Before the drawing and items get them, so panning and pinching don't
    // also draw or drag.
    surface.addEventListener("pointerdown", this.#onSurfaceDown, true);
    surface.addEventListener("contextmenu", this.#onStrokeContextMenu, true);
    surface.addEventListener("pointerdown", this.#onPick, true);
    surface.addEventListener("pointermove", this.#onSurfaceMove, true);
    surface.addEventListener("pointermove", this.#onLoupeMove, true);
    surface.addEventListener("pointerup", this.#onSurfaceUp, true);
    surface.addEventListener("pointercancel", this.#onSurfaceUp, true);
    surface.addEventListener("pointerenter", () => {
      this.#hovered = true;
    });
    surface.addEventListener("pointerleave", () => {
      this.#hovered = false;
      this.#hideLoupe();
    });
    document.addEventListener("pointerdown", this.#onDocumentPress, true);
    document.addEventListener("pointerup", this.#onDocumentPress, true);
    document.addEventListener("pointercancel", this.#onDocumentPress, true);
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

  /**
   * Whether signed notes show who signed them. Hidden, they're drawn and
   * exported without it, and their text gets its room back. They stay signed.
   */
  setShowAuthors(show: boolean): void {
    this.#showAuthors = show;
    this.#surface.toggleAttribute("data-authors-hidden", !show);
  }

  /** Whether pressing the drawing picks a color from it, with the dropper. */
  setPicking(picking: boolean): void {
    this.#picking = picking;
    this.#surface.toggleAttribute("data-picking", picking);
    if (!picking) {
      this.#hideLoupe();
    }
  }

  /** Whether pressing the drawing fills an area, with the paint bucket. */
  setFilling(filling: boolean): void {
    this.#filling = filling;
    this.#surface.toggleAttribute("data-filling", filling);
  }

  /**
   * Whether pressing items moves them, with the select tool, and dragging
   * anywhere else draws a box to pick them. Otherwise, the tool draws over
   * them.
   */
  setMoving(moving: boolean): void {
    this.#moving = moving;
    this.#surface.toggleAttribute("data-moving", moving);
    // Only the select tool picks.
    if (!moving && this.#selection.size > 0) {
      this.#selection.clear();
      this.#showSelection();
    }
    if (!moving) {
      this.#surface.removeAttribute("data-over-stroke");
    }
  }

  /**
   * Whether dragging anywhere pans, with the hand. Items can't be pressed
   * with it, or typed in.
   */
  setHand(hand: boolean): void {
    const picked = hand && !this.#hand;
    this.#hand = hand;
    this.#surface.toggleAttribute("data-hand", hand);
    if (picked) {
      this.#finishEditing();
      this.#focusSelection();
    }
  }

  /**
   * Custom colors picked before, which the format bar offers again, and how
   * they're written.
   */
  setColorSettings(colors: CustomColor[], format: ColorFormat): void {
    this.#formatBar.setColorSettings(colors, format);
  }

  /** Shows another part of the drawing, e.g. once a canvas is opened. */
  setViewport(viewport: Viewport): void {
    if (viewport !== this.#viewport) {
      this.#viewport = viewport;
      this.#applyViewport();
    }
  }

  /**
   * Shows all of `area` of the drawing, as big as fits, centered, e.g. what
   * someone being followed sees. The host isn't told, since it didn't come
   * from the person using it.
   */
  showArea(area: Box): void {
    this.setViewport(
      fitViewport(area, { width: this.#width, height: this.#height }, 0)
    );
  }

  /** Zooms in or out a step, around the canvas's middle. */
  stepZoom(direction: "in" | "out"): void {
    this.#zoomAtCenter(stepZoom(this.#viewport.zoom, direction));
  }

  /** Pans so `point` on the drawing is at the top left, at the same zoom. */
  panTo(point: Point): void {
    this.#changeViewport({ ...this.#viewport, ...point });
  }

  /** Zooms to `zoom`, e.g. 1 for 100%, around the canvas's middle. */
  zoomTo(zoom: number): void {
    this.#zoomAtCenter(zoom);
  }

  /** Shows the whole drawing, as big as fits, or 100% if it's empty. */
  async zoomToFit(): Promise<void> {
    const drawn = await this.#getDrawnBox();
    const boxes: Box[] = [
      ...(drawn ? [drawn] : []),
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

  // The box around what's left of the strokes and fills, or null if nothing
  // is. Erasing a fill doesn't remove what's erased, so it's found by drawing
  // them.
  async #getDrawnBox(): Promise<Box | null> {
    const area = unionBoxes([
      ...this.#strokes.flatMap((stroke) => getStrokeBox(stroke) ?? []),
      ...this.#fills.flatMap((fill) => getFillBox(fill) ?? []),
    ]);
    if (!area || this.#erasers.length === 0) {
      return area;
    }
    const scale = Math.min(
      1,
      Math.sqrt(ZOOM.fitMaxPixels / (area.width * area.height))
    );
    // Only the strokes and fills, on nothing, so what's drawn is opaque.
    const drawing = {
      ...this.#getDrawing(),
      images: [],
      texts: [],
      notes: [],
    };
    const image = renderDrawing(
      drawing,
      area,
      scale,
      null,
      this.#getTextStyle(),
      new Map()
    );
    const context = image?.getContext("2d");
    if (!image || !context) {
      return area;
    }
    const { width, height } = image;
    const { data } = context.getImageData(0, 0, width, height);
    const box = getOpaqueBox(data, width, height, ZOOM.fitMinAlpha);
    return (
      box && {
        x: area.x + box.x / scale,
        y: area.y + box.y / scale,
        width: box.width / scale,
        height: box.height / scale,
      }
    );
  }

  setSize(width: number, height: number): void {
    this.#width = width;
    this.#height = height;
    this.#paint();
    this.#paintPeerInk();
  }

  /**
   * The drawing's strokes, the order its strokes and items are stacked in,
   * once its items are set, and its fills.
   */
  setLayers(
    strokes: Stroke[],
    order: Layer[],
    fills: Fill[],
    erasers: Stroke[]
  ): void {
    // Called on every toolbar change, so skip the paint if nothing changed.
    if (
      strokes === this.#strokes &&
      order === this.#order &&
      fills === this.#fills &&
      erasers === this.#erasers
    ) {
      // A note a stroke's picked on may have moved.
      this.#showStrokeBoxes();
      return;
    }
    this.#strokes = strokes;
    this.#order = order;
    this.#fills = fills;
    this.#erasers = erasers;
    this.#paint();
  }

  setItems<K extends ItemKind>(kind: K, items: DrawingItem<K>[]): void {
    // Each kind has its own layer, which TypeScript can't match to `K`.
    const layer = this.#layers[kind] as unknown as ItemLayer<
      DrawingItem<K>,
      ItemView<DrawingItem<K>>
    >;
    if (kind === "notes") {
      this.#signerName = getSignerNames(items as Note[]);
    }
    layer.setItems(items);
    // Someone new signing can change how others are shown, e.g. a second Ada
    // makes the first "Ada L.", on notes that didn't change too.
    if (kind === "notes") {
      for (const view of this.#layers.notes.views) {
        this.#showByline(view);
      }
    }
    // New views show they're picked too, e.g. ones just pasted.
    this.#showSelection();
  }

  setToolState(toolState: ToolState): void {
    this.#toolState = toolState;
  }

  /** What pressing the canvas places, or null to draw with the tool. */
  setPlacing(placing: Placing | null): void {
    // A note being sized goes if the note tool is put down mid-drag.
    if (placing?.kind !== "notes" && this.#placingPress?.note) {
      this.#cancelPlacing();
    }
    this.#placing = placing;
    if (placing?.kind !== "notes") {
      this.#hideNoteGhost();
    }
    const surface = this.#surface;
    if (placing) {
      surface.dataset.placing = placing.kind;
    } else {
      delete surface.dataset.placing;
    }
  }

  /** Picks an item, e.g. one just added, to move it or delete it. */
  select(kind: ItemKind, id: string): void {
    this.setSelection([{ kind, id }]);
  }

  /** What's picked with the select tool, bottom to top. */
  get selection(): PickRef[] {
    const picked = (ref: PickRef) => this.#selection.has(getKey(ref));
    const strokes = (strokes: Stroke[], note: string | null) =>
      strokes.flatMap<StrokeRef>(({ id }) => {
        const ref: StrokeRef = { kind: "strokes", id, note };
        return picked(ref) ? [ref] : [];
      });
    let start = 0;
    return [
      ...strokes(this.#erasers, null),
      ...this.#order.flatMap<PickRef>((layer) => {
        if (layer.kind === "strokes") {
          const run = this.#strokes.slice(start, start + layer.count);
          start += layer.count;
          return strokes(run, null);
        }
        const ref = { kind: layer.kind, id: layer.id };
        const note =
          layer.kind === "notes"
            ? this.#layers.notes.getView(layer.id)?.item
            : null;
        return [
          ...(picked(ref) ? [ref] : []),
          ...(note ? strokes([...note.erasers, ...note.strokes], note.id) : []),
        ];
      }),
    ];
  }

  /**
   * The strokes picked, as they'd be on the drawing, to copy them. What's
   * left of an eraser isn't one: it would erase wherever it's pasted.
   */
  get pickedStrokes(): Stroke[] {
    return this.selection.flatMap((ref) => {
      if (ref.kind !== "strokes") {
        return [];
      }
      const stroke = this.#findStroke(ref);
      return stroke && !isEraser(stroke) ? [this.#onDrawing(ref, stroke)] : [];
    });
  }

  /** Picks `items`, e.g. ones just pasted, and gives the top one focus. */
  setSelection(items: PickRef[]): void {
    this.#selection = new Map(items.map((item) => [getKey(item), item]));
    this.#showSelection();
    this.#focusSelection();
  }

  /**
   * Picks every item and stroke on the drawing. What's left of an eraser only
   * shows on fills, and a note's strokes move with the note, so they aren't.
   */
  selectAll(): void {
    this.setSelection([
      ...this.#order.flatMap<PickRef>((layer) =>
        layer.kind === "strokes" ? [] : [{ kind: layer.kind, id: layer.id }]
      ),
      ...this.#strokes.map<PickRef>(({ id }) => ({
        kind: "strokes",
        id,
        note: null,
      })),
    ]);
  }

  /** Deletes everything picked, as one change. */
  deleteSelection(): void {
    const selection = this.selection;
    if (selection.length === 0) {
      return;
    }
    // Deleting what's being typed in throws the typing away.
    const editing = this.#editing;
    if (
      editing &&
      selection.some(
        ({ kind, id }) => kind === editing.kind && id === editing.view.item.id
      )
    ) {
      this.#stopEditingNote(editing.kind);
      this.#editing = null;
      this.#formatBar.close();
      this.#options.onActivity?.(null);
    }
    this.#selection.clear();
    const removedItems = selection.flatMap<DrawingChange>((ref) =>
      ref.kind === "strokes"
        ? []
        : [{ type: "remove-item", kind: ref.kind, id: ref.id }]
    );
    const strokes = selection.filter(
      (ref): ref is StrokeRef => ref.kind === "strokes"
    );
    this.#options.onBatch([
      ...this.#getStrokeChanges(strokes, () => null),
      ...removedItems,
    ]);
    this.#showStrokeBoxes();
  }

  // A stroke by its ref, as it's kept.
  #findStroke(ref: StrokeRef): Stroke | null {
    const note = ref.note
      ? this.#layers.notes.getView(ref.note)?.item
      : undefined;
    if (ref.note && !note) {
      return null;
    }
    const strokes = note
      ? [...note.strokes, ...note.erasers]
      : [...this.#strokes, ...this.#erasers];
    return strokes.find(({ id }) => id === ref.id) ?? null;
  }

  // A stroke as it'd be on the drawing, rather than its note.
  #onDrawing(ref: StrokeRef, stroke: Stroke): Stroke {
    const note = ref.note ? this.#layers.notes.getView(ref.note)?.item : null;
    return note ? moveStroke(stroke, note.x, note.y) : stroke;
  }

  // The changes that make each stroke what `change` gives, or removes it if
  // that's null. Strokes on a note are part of it, so it changes as a whole.
  #getStrokeChanges(
    refs: StrokeRef[],
    change: (stroke: Stroke) => Stroke | null
  ): DrawingChange[] {
    const changes: DrawingChange[] = [];
    const notes = new Set<string>();
    for (const ref of refs) {
      if (ref.note) {
        notes.add(ref.note);
        continue;
      }
      const stroke = this.#findStroke(ref);
      if (!stroke) {
        continue;
      }
      const changed = change(stroke);
      changes.push(
        changed
          ? {
              type: "update-stroke",
              id: ref.id,
              fields: { points: changed.points, size: changed.size },
            }
          : { type: "remove-stroke", id: ref.id }
      );
    }
    for (const id of notes) {
      const note = this.#layers.notes.getView(id)?.item;
      if (!note) {
        continue;
      }
      const isPicked = (stroke: Stroke) =>
        refs.some((ref) => ref.note === id && ref.id === stroke.id);
      const apply = (strokes: Stroke[]) =>
        strokes.flatMap((stroke) =>
          isPicked(stroke) ? (change(stroke) ?? []) : [stroke]
        );
      changes.push({
        type: "update-item",
        kind: "notes",
        id,
        fields: {
          ...note,
          strokes: apply(note.strokes),
          erasers: apply(note.erasers),
        },
      });
    }
    return changes;
  }

  // The strokes picked that move on their own: one on a note that's picked
  // moves with the note.
  #getLooseStrokes(): StrokeRef[] {
    return [...this.#selection.values()].filter(
      (ref): ref is StrokeRef =>
        ref.kind === "strokes" &&
        !(ref.note && this.#selection.has(`notes:${ref.note}`))
    );
  }

  // Shows strokes as `change` gives them, until they're changed.
  #showStrokes(refs: StrokeRef[], change: (stroke: Stroke) => Stroke): void {
    const notes = new Set<string>();
    for (const ref of refs) {
      const stroke = this.#findStroke(ref);
      if (stroke) {
        this.#shownStrokes.set(getKey(ref), change(stroke));
      }
      if (ref.note) {
        notes.add(ref.note);
      }
    }
    this.#paintShownStrokes(notes);
  }

  #stopShowingStrokes(): void {
    if (this.#shownStrokes.size === 0) {
      return;
    }
    const notes = new Set(
      [...this.#selection.values()].flatMap((ref) =>
        ref.kind === "strokes" && ref.note ? [ref.note] : []
      )
    );
    this.#shownStrokes.clear();
    this.#paintShownStrokes(notes);
  }

  #paintShownStrokes(notes: Set<string>): void {
    this.#paint();
    for (const id of notes) {
      const view = this.#layers.notes.getView(id);
      if (view) {
        this.#paintInk(view);
      }
    }
  }

  // A stroke as it's shown, which may be on its way somewhere.
  #getShownStroke(stroke: Stroke, note: string | null): Stroke {
    return (
      this.#shownStrokes.get(
        getKey({ kind: "strokes", id: stroke.id, note })
      ) ?? stroke
    );
  }

  // Strokes as they're shown, the same ones if none's on its way anywhere.
  #getShownStrokes(strokes: Stroke[], note: string | null): Stroke[] {
    return this.#shownStrokes.size === 0
      ? strokes
      : strokes.map((stroke) => this.#getShownStroke(stroke, note));
  }

  // Outlines each stroke picked, and, with only one picked, lets its sides
  // and corners resize it. One that's gone, e.g. once it's undone, is no
  // longer picked.
  #showStrokeBoxes(): void {
    const refs = [...this.#selection.values()].filter(
      (ref): ref is StrokeRef => ref.kind === "strokes"
    );
    const resizable = this.#selection.size === 1;
    const { x, y, zoom } = this.#viewport;
    const boxes = refs.flatMap((ref) => {
      const found = this.#findStroke(ref);
      if (!found) {
        this.#selection.delete(getKey(ref));
        return [];
      }
      const stroke = this.#getShownStroke(found, ref.note);
      const box = getStrokeBox(this.#onDrawing(ref, stroke));
      if (!box) {
        return [];
      }
      const element = createElement("div", "canvas-stroke-box");
      element.dataset.strokeKey = getKey(ref);
      element.toggleAttribute("data-eraser", isEraser(stroke));
      element.style.left = px((box.x - x) * zoom);
      element.style.top = px((box.y - y) * zoom);
      element.style.width = px(box.width * zoom);
      element.style.height = px(box.height * zoom);
      if (resizable) {
        for (const handle of RESIZE_HANDLES) {
          const edge = createElement("div", "canvas-stroke-resize");
          edge.dataset.handle = handle;
          element.append(edge);
        }
      }
      return [element];
    });
    this.#strokeBoxes.replaceChildren(...boxes);
  }

  // The top stroke drawn at a point on screen, unless an image or a note is
  // over it. A note's own strokes are over it. What's left of an eraser only
  // shows on fills, so anything drawn is picked before it.
  #getStrokeAt(clientX: number, clientY: number): StrokeRef | null {
    const point = this.getDrawingPoint(clientX, clientY);
    const slack = STROKE_SLACK / this.#viewport.zoom;
    const findIn = (
      strokes: Stroke[],
      at: Point,
      note: string | null
    ): StrokeRef | null => {
      const found = strokes.findLast((stroke) => isStrokeAt(stroke, at, slack));
      return found ? { kind: "strokes", id: found.id, note } : null;
    };
    for (const layer of resolveLayers(this.#getDrawing()).reverse()) {
      if (layer.kind === "strokes") {
        const found = findIn(layer.strokes, point, null);
        if (found) {
          return found;
        }
      } else if (layer.kind !== "texts") {
        const box = this.#layers[layer.kind]
          .getView(layer.item.id)
          ?.element.getBoundingClientRect();
        if (
          box &&
          clientX >= box.left &&
          clientX <= box.right &&
          clientY >= box.top &&
          clientY <= box.bottom
        ) {
          if (layer.kind === "images") {
            return null;
          }
          const { item: note } = layer;
          const inside = { x: point.x - note.x, y: point.y - note.y };
          return (
            findIn(note.strokes, inside, note.id) ??
            findIn(note.erasers, inside, note.id)
          );
        }
      }
    }
    return findIn(this.#erasers, point, null);
  }

  // With the select tool, a press on a stroke, or on the outline of one
  // that's picked, picks it and starts dragging it. Shift adds it to what's
  // picked, or takes it away. Returns whether it was one.
  #pressStroke(event: PointerEvent): boolean {
    const target = event.target as Element;
    const outline = target.closest<HTMLElement>(".canvas-stroke-box");
    const outlined = outline
      ? (this.#selection.get(outline.dataset.strokeKey!) as StrokeRef)
      : undefined;
    const editing = this.#editing?.view.element.contains(target);
    const found = editing
      ? null
      : this.#getStrokeAt(event.clientX, event.clientY);
    // A thin stroke's sides are over its line, which moves it. Its corners
    // still resize it.
    const pressedEdge = target.closest<HTMLElement>(".canvas-stroke-resize");
    const edge =
      pressedEdge?.dataset.handle?.length === 2 ||
      !found ||
      !outlined ||
      getKey(found) !== getKey(outlined)
        ? pressedEdge
        : null;
    const ref = edge ? outlined : (found ?? outlined);
    if (!ref) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    const key = getKey(ref);
    const wasPicked = this.#selection.has(key);
    if (event.shiftKey && !edge) {
      if (wasPicked) {
        this.#selection.delete(key);
      } else {
        this.#selection.set(key, ref);
      }
      this.#showSelection();
      this.#focusSelection();
      if (wasPicked) {
        return true;
      }
    } else if (!wasPicked) {
      this.setSelection([ref]);
    }
    this.#surface.setPointerCapture(event.pointerId);
    const handle = (edge?.dataset.handle as ResizeHandle | undefined) ?? null;
    const stroke = this.#findStroke(ref);
    this.#strokeGesture = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      ref,
      handle,
      box: handle && stroke ? getStrokeBox(stroke) : null,
      moved: false,
      pickAlone: wasPicked && !event.shiftKey && this.#selection.size > 1,
      // Touch has no right-click, so resting on it opens its menu.
      longPress:
        event.pointerType === "touch"
          ? setTimeout(() => {
              this.#cancelStrokeGesture();
              this.#openStrokeMenu(ref, {
                x: event.clientX,
                y: event.clientY,
              });
            }, LONG_PRESS)
          : undefined,
    };
    return true;
  }

  #moveStrokeGesture(event: PointerEvent): void {
    const gesture = this.#strokeGesture!;
    const screenDx = event.clientX - gesture.start.x;
    const screenDy = event.clientY - gesture.start.y;
    if (!gesture.moved && Math.hypot(screenDx, screenDy) < DRAG_THRESHOLD) {
      return;
    }
    gesture.moved = true;
    clearTimeout(gesture.longPress);
    const { zoom } = this.#viewport;
    const dx = screenDx / zoom;
    const dy = screenDy / zoom;
    if (gesture.handle && gesture.box) {
      const { box, handle } = gesture;
      const to = resizeBox(box, handle, dx, dy, MIN_STROKE_BOX);
      this.#showStrokes([gesture.ref], (stroke) =>
        resizeStroke(stroke, box, to)
      );
      this.#showStrokeBoxes();
      return;
    }
    this.#showStrokes(this.#getLooseStrokes(), (stroke) =>
      moveStroke(stroke, dx, dy)
    );
    for (const other of this.#selection.values()) {
      if (other.kind !== "strokes") {
        this.#getAnyLayer(other.kind).showMoved(other.id, dx, dy);
      }
    }
    this.#showStrokeBoxes();
  }

  // Dragged, it's changed, along with the rest of what's picked, as one
  // change to undo. Only clicked, one of several picked is picked alone.
  #endStrokeGesture(event: PointerEvent): void {
    const gesture = this.#strokeGesture!;
    this.#strokeGesture = null;
    clearTimeout(gesture.longPress);
    if (!gesture.moved) {
      if (gesture.pickAlone) {
        this.setSelection([gesture.ref]);
      }
      return;
    }
    const { zoom } = this.#viewport;
    const dx = (event.clientX - gesture.start.x) / zoom;
    const dy = (event.clientY - gesture.start.y) / zoom;
    let changes: DrawingChange[];
    if (gesture.handle && gesture.box) {
      const { box, handle } = gesture;
      const to = resizeBox(box, handle, dx, dy, MIN_STROKE_BOX);
      changes = this.#getStrokeChanges([gesture.ref], (stroke) =>
        resizeStroke(stroke, box, to)
      );
    } else {
      changes = [
        ...this.#getStrokeChanges(this.#getLooseStrokes(), (stroke) =>
          moveStroke(stroke, dx, dy)
        ),
        ...this.#getMovedItems(dx, dy),
      ];
    }
    this.#resetMovedItems();
    this.#shownStrokes.clear();
    this.#options.onBatch(changes);
    this.#showStrokeBoxes();
  }

  // The items picked, `dx` and `dy` further on.
  #getMovedItems(dx: number, dy: number, skip?: ItemRef): DrawingChange[] {
    return [...this.#selection.values()].flatMap<DrawingChange>((other) => {
      if (
        other.kind === "strokes" ||
        (skip && getKey(other) === getKey(skip))
      ) {
        return [];
      }
      const shown = this.#getAnyLayer(other.kind).items.find(
        ({ id }) => id === other.id
      );
      return shown
        ? [
            {
              type: "update-item",
              kind: other.kind,
              id: other.id,
              fields: { ...shown, x: shown.x + dx, y: shown.y + dy },
            },
          ]
        : [];
    });
  }

  #resetMovedItems(): void {
    for (const other of this.#selection.values()) {
      if (other.kind !== "strokes") {
        this.#getAnyLayer(other.kind).showMoved(other.id, 0, 0);
      }
    }
  }

  // Puts back what's being dragged, e.g. as a second finger pinches.
  #cancelStrokeGesture(): void {
    const gesture = this.#strokeGesture;
    if (!gesture) {
      return;
    }
    this.#strokeGesture = null;
    clearTimeout(gesture.longPress);
    this.#resetMovedItems();
    this.#stopShowingStrokes();
    this.#showStrokeBoxes();
  }

  // A stroke's menu, like an item's. What's left of an eraser isn't stacked
  // with anything, so it can only be deleted.
  #openStrokeMenu(ref: StrokeRef, point: Point): void {
    const stroke = this.#findStroke(ref);
    if (!stroke) {
      return;
    }
    const note = ref.note ? this.#layers.notes.getView(ref.note)?.item : null;
    const restack = (to: Restack, label: string): MenuAction => {
      const strokes = note ? note.strokes : this.#strokes;
      const index = strokes.findIndex(({ id }) => id === ref.id);
      return {
        label,
        disabled: note
          ? index === (to === "front" ? strokes.length - 1 : 0)
          : isStrokeAtEdge(this.#order, index, strokes.length, to),
        onSelect: () => this.#restackStroke(ref, to),
      };
    };
    this.#openMenu(point, [
      ...(isEraser(stroke)
        ? []
        : [
            restack("front", "Bring to front"),
            restack("back", "Send to back"),
          ]),
      {
        label: "Delete",
        onSelect: () => {
          if (!this.#selection.has(getKey(ref))) {
            this.setSelection([ref]);
          }
          this.deleteSelection();
        },
      },
    ]);
  }

  // Moves a stroke to the front or back of the drawing, or of its note.
  #restackStroke(ref: StrokeRef, to: Restack): void {
    const note = ref.note ? this.#layers.notes.getView(ref.note)?.item : null;
    if (!note) {
      this.#options.onBatch([{ type: "restack-stroke", id: ref.id, to }]);
      return;
    }
    const stroke = note.strokes.find(({ id }) => id === ref.id);
    if (stroke) {
      const others = note.strokes.filter(({ id }) => id !== ref.id);
      this.#options.onBatch([
        {
          type: "update-item",
          kind: "notes",
          id: note.id,
          fields: {
            ...note,
            strokes: to === "front" ? [...others, stroke] : [stroke, ...others],
          },
        },
      ]);
    }
  }

  // Whichever tool is picked, a right-click on a stroke opens its menu,
  // unless something over it takes it, or it's being typed in.
  #onStrokeContextMenu = (event: MouseEvent): void => {
    const target = event.target as Element;
    if (this.#editing?.view.element.contains(target)) {
      return;
    }
    const ref = this.#getStrokeAt(event.clientX, event.clientY);
    if (ref) {
      event.preventDefault();
      event.stopPropagation();
      this.#openStrokeMenu(ref, { x: event.clientX, y: event.clientY });
    }
  };

  // Marks what's picked, which shows outlined with the select tool.
  #showSelection(): void {
    this.#showStrokeBoxes();
    for (const kind of Object.keys(this.#layers) as ItemKind[]) {
      for (const view of this.#getAnyLayer(kind).views) {
        view.element.toggleAttribute(
          "data-selected",
          this.#selection.has(getKey({ kind, id: view.item.id }))
        );
      }
    }
  }

  // Gives the top item picked focus, so Delete deletes what's picked, or
  // takes focus from an item once nothing is.
  #focusSelection(): void {
    const top = this.selection.findLast(
      (ref): ref is ItemRef => ref.kind !== "strokes"
    );
    const element = top && this.#layers[top.kind].getView(top.id)?.element;
    if (element) {
      this.#keepingSelection = true;
      element.focus();
      this.#keepingSelection = false;
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.#items.contains(active)) {
      active.blur();
    }
  }

  // The item an element shows, if it's an item's own element, rather than
  // what's in it, e.g. a note's text.
  #getItemOf(element: EventTarget | null): ItemRef | null {
    if (!(element instanceof HTMLElement) || !element.dataset.itemId) {
      return null;
    }
    const kind = (Object.keys(this.#layers) as ItemKind[]).find(
      (each) => this.#layers[each].element === element.parentElement
    );
    return kind ? { kind, id: element.dataset.itemId } : null;
  }

  // An item focused some other way than by pressing it, e.g. with Tab, is
  // picked alone, unless it already is.
  #onItemFocus = (event: FocusEvent): void => {
    const item = this.#getItemOf(event.target);
    if (item && !this.#keepingSelection && !this.#selection.has(getKey(item))) {
      this.#selection = new Map([[getKey(item), item]]);
      this.#showSelection();
    }
  };

  // Escape on a picked item picks nothing.
  #onItemKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key === "Escape" &&
      this.#selection.size > 0 &&
      this.#getItemOf(event.target)
    ) {
      this.setSelection([]);
    }
  };

  // With the select tool, pressing an item picks it alone, or, with Shift
  // held, adds it to what's picked, or takes it away if it was picked.
  #pressItem(
    kind: ItemKind,
    view: ItemView<PlacedItem>,
    extend: boolean
  ): void {
    const item = { kind, id: view.item.id };
    const key = getKey(item);
    if (!extend) {
      this.setSelection([item]);
      return;
    }
    if (this.#selection.has(key)) {
      this.#selection.delete(key);
    } else {
      this.#selection.set(key, item);
    }
    this.#showSelection();
    this.#focusSelection();
  }

  // Everything else picked moves along with the picked item being dragged,
  // as far as it's moved.
  #moveSelectionWith(kind: ItemKind, item: PlacedItem, from: PlacedItem): void {
    const dragged = { kind, id: item.id };
    if (!this.#selection.has(getKey(dragged)) || this.#selection.size < 2) {
      return;
    }
    const dx = item.x - from.x;
    const dy = item.y - from.y;
    this.#groupMove = { ...dragged, dx, dy };
    for (const other of this.#selection.values()) {
      if (other.kind !== "strokes" && getKey(other) !== getKey(dragged)) {
        this.#getAnyLayer(other.kind).showMoved(other.id, dx, dy);
      }
    }
    this.#showStrokes(this.#getLooseStrokes(), (stroke) =>
      moveStroke(stroke, dx, dy)
    );
    this.#showStrokeBoxes();
  }

  // An item was moved or resized. Moved with everything else picked, they
  // all change together, as one change to undo.
  #changeItem<K extends ItemKind>(kind: K, item: DrawingItem<K>): void {
    const group = this.#groupMove;
    this.#groupMove = null;
    if (!group || group.kind !== kind || group.id !== item.id) {
      this.#options.onItemChange(kind, item);
      return;
    }
    const changes: DrawingChange[] = [
      { type: "update-item", kind, id: item.id, fields: item },
      ...this.#getMovedItems(group.dx, group.dy, group),
      ...this.#getStrokeChanges(this.#getLooseStrokes(), (stroke) =>
        moveStroke(stroke, group.dx, group.dy)
      ),
    ];
    this.#shownStrokes.clear();
    this.#options.onBatch(changes);
    this.#showStrokeBoxes();
  }

  // Everything else picked goes back if the item being dragged with them
  // was put back, e.g. as a second finger pinched.
  #endGroupMove(): void {
    const group = this.#groupMove;
    this.#groupMove = null;
    if (group) {
      this.#resetMovedItems();
      this.#stopShowingStrokes();
      this.#showStrokeBoxes();
    }
  }

  // Deleting a picked item deletes everything picked.
  #deleteItem(kind: ItemKind, view: ItemView<PlacedItem>): void {
    const key = getKey({ kind, id: view.item.id });
    if (this.#selection.has(key) && this.#selection.size > 1) {
      this.deleteSelection();
    } else {
      this.#delete(kind, view);
    }
  }

  // Sizes the box dragged with the select tool, picking what it touches, as
  // well as what it keeps. A press that hasn't moved far is only a click, so
  // it picks nothing.
  #sizeMarquee(event: PointerEvent): void {
    const { start, before, element } = this.#marquee!;
    const box: Box = {
      x: Math.min(start.x, event.clientX),
      y: Math.min(start.y, event.clientY),
      width: Math.abs(event.clientX - start.x),
      height: Math.abs(event.clientY - start.y),
    };
    const bounds = this.#overlay.getBoundingClientRect();
    element.style.left = px(box.x - bounds.left);
    element.style.top = px(box.y - bounds.top);
    element.style.width = px(box.width);
    element.style.height = px(box.height);
    this.#selection = new Map(before);
    const layers =
      Math.hypot(box.width, box.height) < DRAG_THRESHOLD ? [] : this.#order;
    for (const layer of layers) {
      if (layer.kind === "strokes") {
        continue;
      }
      const view = this.#layers[layer.kind].getView(layer.id);
      if (view && isOverlapping(view.element.getBoundingClientRect(), box)) {
        this.#selection.set(getKey(layer), { kind: layer.kind, id: layer.id });
      }
    }
    if (layers.length > 0) {
      const from = this.getDrawingPoint(box.x, box.y);
      const to = this.getDrawingPoint(box.x + box.width, box.y + box.height);
      const area = {
        x: from.x,
        y: from.y,
        width: to.x - from.x,
        height: to.y - from.y,
      };
      for (const stroke of this.#strokes) {
        if (isStrokeInBox(stroke, area)) {
          const ref: StrokeRef = { kind: "strokes", id: stroke.id, note: null };
          this.#selection.set(getKey(ref), ref);
        }
      }
    }
    this.#showSelection();
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
    document.removeEventListener("pointerdown", this.#onDocumentPress, true);
    document.removeEventListener("pointerup", this.#onDocumentPress, true);
    document.removeEventListener("pointercancel", this.#onDocumentPress, true);
    document.removeEventListener("keydown", this.#onSpace);
    document.removeEventListener("keyup", this.#onSpace);
    window.removeEventListener("blur", this.#onWindowBlur);
    for (const url of this.#imageUrls.values()) {
      void url.then((value) => value && URL.revokeObjectURL(value));
    }
    this.#imageUrls.clear();
  }

  /**
   * Shows an image's file again, e.g. once it's arrived from someone drawing
   * together with this canvas, after the image itself.
   */
  reloadImage(id: string): void {
    const before = this.#imageUrls.get(id);
    this.#imageUrls.delete(id);
    const view = this.#layers.images.getView(id);
    void this.#getImageUrl(id).then((url) => {
      if (view && url) {
        view.image.src = url;
        view.element.removeAttribute("data-missing");
      }
      void before?.then((value) => value && URL.revokeObjectURL(value));
    });
  }

  /**
   * The drawing as a file, drawn again at the chosen scale rather than copied
   * from the screen, so its size doesn't depend on the screen's. `author`,
   * if there is one, is kept in the file, except a JPEG.
   */
  async export(options: ExportOptions, author = ""): Promise<Blob | null> {
    const drawing = this.#getDrawing();
    const textStyle = this.#getTextStyle();
    const files = new Map<string, Blob>();
    for (const { id } of drawing.images) {
      const file = await this.#options.getImage(id);
      if (file) {
        files.set(id, file);
      }
    }
    return exportDrawing(
      drawing,
      this.visibleArea,
      options,
      this.#background,
      textStyle,
      files,
      author
    );
  }

  // What drawing the drawing again needs: the drawing, how its text looks,
  // which comes from CSS, and its images. They're the ones shown, which the
  // browser has already decoded, so drawing again often, e.g. with the
  // dropper, doesn't read and decode their files each time.
  async #getRendering() {
    const textStyle = this.#getTextStyle();
    const drawing = this.#getDrawing();
    const images = new Map<string, CanvasImageSource>();
    for (const { id } of drawing.images) {
      // Its view shows the file once its URL is made.
      const url = await this.#getImageUrl(id);
      const image = this.#layers.images.getView(id)?.image;
      if (url && image) {
        try {
          await image.decode();
          images.set(id, image);
        } catch {
          // It can't be shown either, so it's left out.
        }
      }
    }
    return { drawing, textStyle, images };
  }

  // How text is drawn again, which comes from CSS.
  #getTextStyle() {
    return {
      noteColor: getCssVariable(
        this.#interfaceLayer,
        "--canvas-color-note-text"
      ),
      fontFamily: getComputedStyle(this.#items).fontFamily,
    };
  }

  // The drawing, as it's shown.
  #getDrawing(): Drawing {
    const notes = this.#layers.notes.items;
    return {
      background: this.#background,
      strokes: this.#getShownStrokes(this.#strokes, null),
      fills: this.#fills,
      erasers: this.#getShownStrokes(this.#erasers, null),
      images: this.#layers.images.items,
      texts: this.#layers.texts.items,
      // Drawn as they're shown, without who signed them while that's hidden.
      notes: this.#showAuthors
        ? notes
        : notes.map((note) => {
            const unsigned = { ...note };
            delete unsigned.authors;
            return unsigned;
          }),
      order: this.#order,
    };
  }

  // The color of the drawing at `point`, as it's drawn, including images,
  // notes and the background.
  async #sampleColor(point: Point): Promise<CustomColor | null> {
    const data = await this.#samplePixels(point, 1);
    return data && toHex([...data.data]);
  }

  // The drawing's pixels around `point`, `count` across, as they're drawn.
  // The middle one is the color picked there.
  async #samplePixels(point: Point, count: number): Promise<ImageData | null> {
    const { drawing, textStyle, images } = await this.#getRendering();
    // Screen pixels, at the screen's zoom, so they're the colors that are
    // seen.
    const zoom = this.#viewport.zoom;
    const size = count / zoom;
    const image = renderDrawing(
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
      images
    );
    const context = image?.getContext("2d");
    return context?.getImageData(0, 0, count, count) ?? null;
  }

  // With the dropper, the magnifier follows a mouse, showing what a press
  // would pick. Touch and pen have no hover position.
  #onLoupeMove = (event: PointerEvent): void => {
    if (!this.#picking || event.pointerType !== "mouse" || !event.isPrimary) {
      this.#hideLoupe();
      return;
    }
    this.#loupe.start();
    this.#sampleLoupe({ x: event.clientX, y: event.clientY });
  };

  // Samples the pixels around `client`, a point on screen, for the
  // magnifier. While one is being sampled, only the latest point is kept,
  // so it never falls behind the pointer.
  #sampleLoupe(client: Point): void {
    this.#loupeAt = client;
    this.#loupeStale = true;
    if (this.#sampling) {
      return;
    }
    this.#sampling = true;
    void (async () => {
      try {
        while (this.#loupeStale && this.#loupeAt) {
          this.#loupeStale = false;
          const { x, y } = this.#loupeAt;
          const point = this.getDrawingPoint(x, y);
          const data = await this.#samplePixels(point, LOUPE_LAYOUT.pixels);
          if (data && this.#loupe.active) {
            const middle = Math.floor(LOUPE_LAYOUT.pixels / 2);
            const index = (middle * LOUPE_LAYOUT.pixels + middle) * 4;
            const color = toHex([...data.data.slice(index, index + 4)]);
            await this.#loupe.show(data, color, this.#toCanvasPoint(x, y));
            // The pointer is hidden once the magnifier's middle shows where
            // it is.
            this.#surface.toggleAttribute("data-loupe", this.#loupe.shown);
          }
        }
      } finally {
        this.#sampling = false;
      }
    })();
  }

  #hideLoupe(): void {
    this.#loupe.hide();
    this.#surface.toggleAttribute("data-loupe", false);
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
        this.#paintRun(runs, layer.strokes, zIndex, isOpen(runs));
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
      this.#paintRun(runs++, [], String(layers.length + 1), true);
    }
    // The first canvas stays, even with no strokes, ready for some.
    if (runs === 0) {
      this.#paintRun(runs++, [], "1", true);
    }
    for (const run of this.#runs.splice(runs)) {
      run.canvas.remove();
    }
    // Keep a stroke in progress, e.g. if the window resizes mid-stroke.
    if (drawn && !drawn.note) {
      if (drawn.stroke.opacity === undefined) {
        this.#drawLive(drawn);
      } else {
        this.#paintPreview(drawn);
      }
    }
    this.#showStrokeBoxes();
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
    const erasers = this.#getShownStrokes(this.#erasers, null);
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
      isSame(painted.fills, fills) &&
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
    drawFills(context, fills, erasers);
  }

  // Draws a run of strokes on its canvas. Strokes that were only added, e.g. by redo, are drawn on top. An open run, which
  // strokes can be added to, covers what the canvas shows.
  #paintRun(
    index: number,
    strokes: Stroke[],
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
    run.painted = { area, pixelRatio, viewport, strokes };
    if (
      painted &&
      isSameBox(painted.area, area) &&
      painted.pixelRatio === pixelRatio &&
      painted.viewport === viewport &&
      startsWith(strokes, painted.strokes)
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
    for (const stroke of strokes) {
      drawStroke(context, stroke);
    }
  }

  // Where a run's canvas goes, in whole screen pixels from the canvas's top
  // left: over everything the canvas shows if it's open, or else around its
  // strokes, within that.
  #getRunArea(strokes: Stroke[], open: boolean): Box {
    const width = this.#width;
    const height = this.#height;
    if (open) {
      return { x: 0, y: 0, width, height };
    }
    const box = unionBoxes(
      strokes.flatMap((stroke) => getCachedStrokeBox(stroke) ?? [])
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
    const { width, height } = this.#getInkSize(item);
    const inked: Inked = {
      strokes: this.#getShownStrokes(item.strokes, item.id),
      fills: item.fills,
      erasers: this.#getShownStrokes(item.erasers, item.id),
      width,
      height,
    };
    if (!view.ink && item.strokes.length > 0) {
      view.ink = createElement("canvas", "canvas-note-ink");
      // Above its byline too, as exports draw it.
      (view.byline ?? editor.element).after(view.ink);
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

  // How many pixels a note's own canvases have: as few as look sharp at the
  // zoom, within what a browser can draw.
  #getInkSize(note: Note): Size {
    const scale = Math.min(
      this.#viewport.zoom * (window.devicePixelRatio || 1),
      Math.sqrt(MAX_INK_PIXELS / (note.width * note.height))
    );
    return {
      width: Math.max(1, Math.round(note.width * scale)),
      height: Math.max(1, Math.round(note.height * scale)),
    };
  }

  // Draws a note's strokes, or its fills, on one of its canvases, from its
  // top left corner, unless they're already drawn. Strokes added since,
  // e.g. one just drawn, are drawn on top instead, and don't change its fills.
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
    const { width, height, strokes, fills, erasers } = inked;
    if (
      before &&
      before.width === width &&
      before.height === height &&
      before.fills === fills &&
      before.erasers === erasers &&
      startsWith(strokes, before.strokes)
    ) {
      if (what === "strokes") {
        for (const stroke of strokes.slice(before.strokes.length)) {
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
      drawFills(context, fills, erasers);
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
    const canvases =
      stroke.opacity !== undefined
        ? [this.#preview]
        : note
          ? [note.ink, erasing ? note.fillCanvas : null]
          : run === null
            ? [...this.#runs.map(({ canvas }) => canvas), this.#fillCanvas]
            : [this.#runs[run]?.canvas];
    return canvases.flatMap((canvas) => canvas?.getContext("2d") ?? []);
  }

  // Draws the stroke being drawn where it shows as it's drawn, or only
  // `range` of its pieces, e.g. what a point just added adds. A see-through
  // one is solid on its preview, which is as see-through as it'll be.
  #drawLive(drawn: Drawn, range?: { from: number; end: boolean }): void {
    const stroke =
      drawn.stroke.opacity === undefined
        ? drawn.stroke
        : { ...drawn.stroke, opacity: undefined };
    for (const context of this.#getDrawnContexts(drawn)) {
      drawStroke(context, stroke, range);
    }
  }

  // A see-through stroke shows on a canvas of its own while it's drawn, just
  // above where it'll be: on its note, or the run it's part of. The canvas
  // is see-through and the stroke solid on it, so where its pieces overlap
  // as they're added isn't any darker. Once it's done, it's drawn with the
  // rest, all at once.
  #paintPreview(drawn: Drawn): void {
    const { stroke, note, run } = drawn;
    const below = note
      ? (note.ink ?? note.byline ?? note.editor.element)
      : run === null
        ? null
        : this.#runs[run]?.canvas;
    if (!below || stroke.opacity === undefined) {
      return;
    }
    const canvas =
      this.#preview ??
      createElement("canvas", note ? "canvas-note-ink" : "canvas-drawing");
    this.#preview = canvas;
    canvas.style.opacity = String(stroke.opacity);
    if (below.nextSibling !== canvas) {
      below.after(canvas);
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    if (note) {
      const { width, height } = this.#getInkSize(note.item);
      canvas.width = width;
      canvas.height = height;
      context.setTransform(
        width / note.item.width,
        0,
        0,
        height / note.item.height,
        0,
        0
      );
    } else {
      const width = this.#width;
      const height = this.#height;
      const pixelRatio = window.devicePixelRatio || 1;
      const viewport = this.#viewport;
      canvas.style.zIndex = below.style.zIndex;
      placeOnScreen(canvas, viewport, { x: 0, y: 0, width, height });
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      const scale = pixelRatio * viewport.zoom;
      context.setTransform(
        scale,
        0,
        0,
        scale,
        -viewport.x * scale,
        -viewport.y * scale
      );
    }
    this.#drawLive(drawn);
  }

  #removePreview(): void {
    this.#preview?.remove();
    this.#preview = null;
  }

  // Adds where the pointer is to the stroke being drawn, from its note's top
  // left corner on one, with how hard a pen pressed, unless it's too close to
  // the last point to change the stroke. A see-through stroke is one width
  // throughout, so it's drawn all at once. Whether it was added.
  #addPoint(drawn: Drawn, event: PointerEvent): boolean {
    const { stroke, note } = drawn;
    const point = this.#getPoint(event);
    const origin = note?.item ?? { x: 0, y: 0 };
    const x = point.x - origin.x;
    const y = point.y - origin.y;
    const last = stroke.points.at(-1);
    const zoom = this.#viewport.zoom;
    if (last && Math.hypot(x - last.x, y - last.y) * zoom < MIN_POINT_GAP) {
      return false;
    }
    const pressed = event.pointerType === "pen" && stroke.opacity === undefined;
    stroke.points.push({
      x,
      y,
      ...(pressed && { pressure: Math.round(event.pressure * 100) / 100 }),
    });
    return true;
  }

  #getPoint(event: PointerEvent): Point {
    return this.getDrawingPoint(event.clientX, event.clientY);
  }

  #moveCursor(event: PointerEvent): void {
    this.#moveNoteGhost(event);
    this.#surface.toggleAttribute(
      "data-over-stroke",
      this.#moving && this.#getStrokeAt(event.clientX, event.clientY) !== null
    );
    const cursor = this.#cursor;
    // Touch and pen have no hover position, so the cursor only follows a
    // mouse. Placing, moving, panning, filling and picking have no size to show.
    if (
      event.pointerType !== "mouse" ||
      this.#placing ||
      this.#moving ||
      this.#hand ||
      this.#filling ||
      this.#picking
    ) {
      cursor.style.visibility = "hidden";
      return;
    }
    const { x, y } = this.#toCanvasPoint(event.clientX, event.clientY);
    // The tool's size is on screen, whatever the zoom.
    const size = this.#toolState.size * 2;
    cursor.toggleAttribute("data-square", this.#toolState.cap === "square");
    cursor.style.visibility = "visible";
    cursor.style.left = px(x);
    cursor.style.top = px(y);
    cursor.style.width = px(size);
    cursor.style.height = px(size);
  }

  // With the note tool, a see-through note the size of a new one, in its
  // color, shows where clicking would place it. Only a mouse hovers, and
  // pressing while typing only finishes typing, so it's hidden then.
  #moveNoteGhost(event: PointerEvent): void {
    const ghost = this.#noteGhost;
    const placing = this.#placing;
    if (
      event.pointerType !== "mouse" ||
      placing?.kind !== "notes" ||
      this.#placingPress?.note ||
      this.#editing
    ) {
      this.#hideNoteGhost();
      return;
    }
    // Lined up with the notes near it, as it would be placed.
    const box = this.#placeNewNote(this.#getPoint(event), event.altKey);
    const { x, y, zoom } = this.#viewport;
    ghost.style.visibility = "visible";
    ghost.style.left = px((box.x - x) * zoom);
    ghost.style.top = px((box.y - y) * zoom);
    ghost.style.width = px(box.width * zoom);
    ghost.style.height = px(box.height * zoom);
    ghost.style.borderRadius = px(NOTE_LAYOUT.cornerRadius * zoom);
    ghost.style.backgroundColor = this.#getNoteColor(placing.color);
  }

  // Its guides go with it, but not a moving note's.
  #hideNoteGhost(): void {
    const ghost = this.#noteGhost;
    if (ghost.style.visibility === "visible") {
      this.#showSnapGuides([]);
    }
    ghost.style.visibility = "hidden";
  }

  // Where a new note centered on `point` goes: lined up with the notes on
  // screen near it, as one being moved is, with guides showing what it lined
  // up with, unless `free`, e.g. with Alt held.
  #placeNewNote(point: Point, free: boolean): Box {
    const { size } = NOTE_LAYOUT;
    const box = {
      x: point.x - size / 2,
      y: point.y - size / 2,
      width: size,
      height: size,
    };
    if (free) {
      this.#showSnapGuides([]);
      return box;
    }
    const area = this.visibleArea;
    const others = this.#layers.notes.views
      .map(({ item }) => item)
      .filter((other) => intersectBoxes(other, area));
    const { x, y, guides } = snapBox(
      box,
      others,
      NOTE_SNAP.distance / this.#viewport.zoom,
      NOTE_SNAP.gap
    );
    this.#showSnapGuides(guides);
    return { ...box, x, y };
  }

  // What color a note in `color` is: a light shade of a palette color, so its
  // text stays readable, or a custom color as it is, but solid, so what's
  // under it doesn't show through.
  #getNoteColor(color: ToolColor): string {
    return isCustomColor(color)
      ? withAlpha(color, 1)
      : getNoteShade(this.#interfaceLayer, color);
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }
    // An item is placed on release instead, since focusing it now would be
    // undone as the press moves focus. A press that finishes typing only
    // finishes it, but an item still focused once typing's finished, e.g.
    // with Escape, doesn't keep the press from placing another.
    if (this.#placing) {
      const active = document.activeElement;
      if (!this.#editing && !this.#overlay.contains(active)) {
        this.#placingPress = {
          pointerId: event.pointerId,
          client: { x: event.clientX, y: event.clientY },
          start: this.#getPoint(event),
          note: null,
        };
        // Capture keeps a note being sized if the pointer leaves the canvas.
        this.#interfaceLayer.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (this.#filling) {
      void this.#fillAt(event.clientX, event.clientY);
      return;
    }
    const { color, size, opacity, cap } = this.#toolState;
    // A stroke started on a note is drawn on it, from its top left corner.
    const note = this.#getNoteAt(event.clientX, event.clientY);
    // A see-through color is drawn solid, with the stroke as a whole
    // see-through, as the highlighter's is, so it's no darker where it
    // crosses itself.
    const { solid, alpha } = splitAlpha(
      color === undefined ? "" : resolveColor(this.#interfaceLayer, color)
    );
    const shows = (opacity ?? 1) * alpha;
    const stroke: Stroke = {
      id: createId(),
      color: color === undefined ? undefined : solid,
      points: [],
      // The size picked is on screen, so the stroke looks it at any zoom,
      // and is thinner on the drawing the further in it's zoomed.
      size: size / this.#viewport.zoom,
      ...(shows < 1 && color !== undefined && { opacity: shows }),
      ...(cap && color !== undefined && { cap }),
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
    this.#addPoint(drawn, event);
    this.#drawn = drawn;
    if (note && !note.ink) {
      // Its first stroke, which needs a canvas.
      note.ink = createElement("canvas", "canvas-note-ink");
      (note.byline ?? note.editor.element).after(note.ink);
      this.#paintInk(note);
    } else if (!note && drawn.run === runs) {
      this.#paint();
    }
    // Capture keeps the stroke going if the pointer leaves the canvas.
    this.#interfaceLayer.setPointerCapture(event.pointerId);
    if (stroke.opacity === undefined) {
      this.#drawLive(drawn);
    } else {
      this.#paintPreview(drawn);
    }
    this.#shareStroke(drawn);
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (!event.isPrimary) {
      return;
    }
    this.#moveCursor(event);
    if (this.#placingPress?.pointerId === event.pointerId) {
      this.#sizeNote(event);
      return;
    }
    const drawn = this.#drawn;
    if (!drawn) {
      return;
    }
    // Every point the pointer passed since the last event, where the browser
    // has them, so a fast stroke stays smooth.
    const from = drawn.stroke.points.length;
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const each of coalesced.length > 0 ? coalesced : [event]) {
      this.#addPoint(drawn, each);
    }
    if (drawn.stroke.points.length > from) {
      this.#drawLive(drawn, { from, end: false });
      this.#shareStroke(drawn);
    }
  };

  #onPointerUp = (event: PointerEvent): void => {
    const press = this.#placingPress;
    if (press?.pointerId === event.pointerId) {
      this.#placingPress = null;
      if (event.type !== "pointerup" || !this.#placing) {
        if (press.note) {
          this.#layers.notes.endDraft(false);
        }
      } else if (press.note) {
        this.#startEditing("notes", press.note);
      } else {
        this.#placeDraft(this.#getPoint(event), this.#placing, event.altKey);
      }
      return;
    }
    const drawn = this.#drawn;
    if (!event.isPrimary || !drawn) {
      return;
    }
    this.#drawn = null;
    const { stroke, run, note } = drawn;
    // Its end waited for a point that might curve it.
    this.#drawLive(drawn, { from: stroke.points.length, end: true });
    // A see-through one is drawn again, all at once, once it's added.
    const drawnAlready = stroke.opacity === undefined;
    if (note && isEraser(stroke)) {
      // It cuts the note's strokes, and is only kept if it erases its fills.
      const { item } = note;
      this.#options.onItemChange("notes", {
        ...item,
        strokes: eraseStrokes(item.strokes, stroke),
        erasers: touchesFill(item.fills, stroke)
          ? [...item.erasers, stroke]
          : item.erasers,
      });
      note.inked = null;
      note.filled = null;
      this.#paintInk(note);
      this.#options.onActivity?.(null);
      return;
    }
    if (note) {
      const strokes = [...note.item.strokes, stroke];
      // It's already drawn, so it isn't drawn again once it's added.
      if (note.inked && drawnAlready) {
        note.inked = { ...note.inked, strokes };
      }
      this.#options.onItemChange("notes", { ...note.item, strokes });
      this.#removePreview();
      this.#options.onActivity?.(null);
      return;
    }
    const painted = run === null ? null : this.#runs[run]?.painted;
    if (painted && drawnAlready) {
      painted.strokes = [...painted.strokes, stroke];
    }
    this.#options.onStrokeComplete(stroke);
    this.#removePreview();
    this.#options.onActivity?.(null);
    // An eraser showed as it was drawn, and what it cut is drawn again.
    if (isEraser(stroke)) {
      for (const each of this.#runs) {
        each.painted = null;
      }
      this.#paintedFills = null;
      this.#paint();
    }
  };

  #shareStroke({ stroke, note }: Drawn): void {
    this.#options.onActivity?.({
      type: "stroke",
      note: note?.item.id ?? null,
      stroke,
    });
  }

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
      const { drawing, textStyle, images } = await this.#getRendering();
      const image = renderDrawing(
        drawing,
        area,
        scale,
        this.#background,
        textStyle,
        images
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
          after: note.item.erasers.length,
        };
        this.#options.onItemChange("notes", {
          ...note.item,
          fills: [...note.item.fills, fill],
        });
      } else {
        this.#options.onFill({
          color: fillColor,
          rings,
          after: this.#erasers.length,
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
    this.#hideNoteGhost();
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
    this.#paintPeerInk();
    this.#placeFormatBar();
    // What's under the pointer changes as the drawing scrolls and zooms.
    if (this.#loupe.active && this.#loupeAt) {
      this.#sampleLoupe(this.#loupeAt);
    }
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
    this.#removePreview();
    this.#options.onActivity?.(null);
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
    const onCanvas = event.target === this.#interfaceLayer;
    if (event.pointerType === "touch") {
      this.#touches.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (this.#touches.size === 2) {
        this.#cancelStroke();
        this.#pan = null;
        this.#cancelMarquee();
        this.#cancelStrokeGesture();
        this.#cancelPlacing();
        for (const layer of Object.values(this.#layers)) {
          layer.cancelGesture();
        }
        this.#pinch = this.#measurePinch();
      }
      if (this.#pinch) {
        event.stopPropagation();
      }
      // One finger draws, unless the tool picks or pans.
      if (this.#pinch || !(this.#moving || this.#hand)) {
        return;
      }
    }
    if (
      event.button === 0 &&
      this.#moving &&
      !this.#spaceHeld &&
      this.#pressStroke(event)
    ) {
      return;
    }
    // With the select tool, dragging anywhere but an item picks what the box
    // it drags out touches, on top of what's picked if Shift is held.
    if (event.button === 0 && this.#moving && !this.#spaceHeld && onCanvas) {
      event.preventDefault();
      event.stopPropagation();
      this.#surface.setPointerCapture(event.pointerId);
      const picked = new Map(this.#selection);
      if (!event.shiftKey) {
        this.setSelection([]);
      }
      const element = createElement("div", "canvas-marquee");
      this.#overlay.append(element);
      this.#marquee = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        before: new Map(this.#selection),
        picked,
        element,
      };
      this.#sizeMarquee(event);
      return;
    }
    if (
      event.button === 1 ||
      (event.button === 0 && (this.#spaceHeld || (this.#hand && onCanvas)))
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

  // A second finger on a box being dragged is a pinch instead, so it goes,
  // and what was picked comes back.
  #cancelMarquee(): void {
    const marquee = this.#marquee;
    if (!marquee) {
      return;
    }
    marquee.element.remove();
    this.#marquee = null;
    this.#selection = marquee.picked;
    this.#showSelection();
    this.#focusSelection();
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
    if (this.#marquee?.pointerId === event.pointerId) {
      event.stopPropagation();
      this.#sizeMarquee(event);
      return;
    }
    if (this.#strokeGesture?.pointerId === event.pointerId) {
      event.stopPropagation();
      this.#moveStrokeGesture(event);
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
    if (this.#strokeGesture?.pointerId === event.pointerId) {
      event.stopPropagation();
      if (event.type === "pointerup") {
        this.#endStrokeGesture(event);
      } else {
        this.#cancelStrokeGesture();
      }
      return;
    }
    const marquee = this.#marquee;
    if (marquee?.pointerId === event.pointerId) {
      event.stopPropagation();
      marquee.element.remove();
      this.#marquee = null;
      this.#focusSelection();
      return;
    }
    if (this.#pan?.pointerId === event.pointerId) {
      event.stopPropagation();
      this.#pan = null;
      this.#surface.toggleAttribute("data-panning", this.#spaceHeld);
    }
  };

  // With the note tool, dragging from where the canvas was pressed sizes a
  // note between there and the pointer, from its smallest size up. It's
  // opened for typing on release.
  #sizeNote(event: PointerEvent): void {
    const press = this.#placingPress!;
    const placing = this.#placing;
    if (placing?.kind !== "notes") {
      return;
    }
    const dragged = Math.hypot(
      event.clientX - press.client.x,
      event.clientY - press.client.y
    );
    if (!press.note && dragged < DRAG_THRESHOLD) {
      return;
    }
    const { start } = press;
    const point = this.#getPoint(event);
    const { minSize } = NOTE_LAYOUT;
    const width = Math.max(Math.abs(point.x - start.x), minSize);
    const height = Math.max(Math.abs(point.y - start.y), minSize);
    const box = {
      x: point.x < start.x ? start.x - width : start.x,
      y: point.y < start.y ? start.y - height : start.y,
      width,
      height,
    };
    if (press.note) {
      this.#layers.notes.updateDraft({ ...press.note.item, ...box });
    } else {
      press.note = this.#addNoteDraft(box, placing);
    }
  }

  // Stops placing an item, e.g. once a second finger pinches, removing the
  // note being sized.
  #cancelPlacing(): void {
    if (this.#placingPress?.note) {
      this.#layers.notes.endDraft(false);
    }
    this.#placingPress = null;
  }

  // A note that isn't in the drawing yet, above everything, as it will be once
  // it's added. It's signed by the author, if there is one.
  #addNoteDraft(
    box: Box,
    { color: toolColor, author }: Extract<Placing, { kind: "notes" }>
  ): NoteView {
    const view = this.#layers.notes.addDraft({
      id: createId(),
      ...box,
      color: this.#getNoteColor(toolColor),
      content: [{ runs: [] }],
      strokes: [],
      erasers: [],
      fills: [],
      ...(author && { authors: [author] }),
    });
    view.element.style.zIndex = String(this.#order.length + 1);
    return view;
  }

  // A note centered where the canvas was pressed, lined up with the notes
  // near it unless `free`, or text starting there, ready to type in.
  #placeDraft(point: Point, placing: Placing, free: boolean): void {
    if (placing.kind === "notes") {
      const box = this.#placeNewNote(point, free);
      this.#showSnapGuides([]);
      this.#startEditing("notes", this.#addNoteDraft(box, placing));
      return;
    }
    const color = resolveColor(this.#interfaceLayer, placing.color);
    // Above everything, as it will be once it's added.
    const zIndex = String(this.#order.length + 1);
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
    this.#hideNoteGhost();
    if (kind === "notes") {
      this.#options.onEditingNote?.((view.item as unknown as Note).color);
    }
    view.element.toggleAttribute("data-editing", true);
    this.#showEmpty(typed);
    view.editor.edit();
    this.#shareTyping();
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

  // Keeps what was typed. A note is kept even if it's empty. A text box left
  // empty is removed, and a new one is only added once it has text, so a
  // stray click doesn't leave one.
  #finishEditing(): void {
    const editing = this.#editing;
    if (!editing) {
      return;
    }
    this.#editing = null;
    const { kind, view } = editing;
    this.#stopEditingNote(kind);
    this.#formatBar.close();
    view.element.removeAttribute("data-editing");
    view.editor.stopEditing();
    // Text past a note's bottom isn't shown, so it shows its start again.
    view.editor.element.scrollTop = 0;
    const layer = this.#getLayer(kind);
    let content = view.editor.content;
    // A note with only spaces or empty lines typed is kept empty, so it shows
    // its hint again.
    if (kind === "notes" && isBlank(content) && !isEmpty(content)) {
      content = [{ runs: [] }];
      view.editor.setContent(content);
    }
    this.#showEmpty(view);
    const blank = kind === "texts" && isBlank(content);
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
    this.#options.onActivity?.(null);
  }

  // What's being typed, so far, for everyone drawing together.
  #shareTyping(): void {
    const editing = this.#editing;
    if (!editing) {
      return;
    }
    const { kind, view } = editing;
    const item = { ...view.item, content: view.editor.content } as
      | Note
      | TextBox;
    this.#options.onActivity?.({
      type: "typing",
      kind,
      item:
        kind === "notes"
          ? { ...(item as Note), strokes: [], erasers: [], fills: [] }
          : item,
    });
  }

  // An empty text box shows a hint while it's typed in, and is wide enough
  // to find again. An empty note always shows it, since it's kept. Anything
  // typed, even a space, hides it.
  #showEmpty({ element, editor }: TypedView<TypedItem>): void {
    element.toggleAttribute(
      "data-empty",
      (editor.isEditable || element.classList.contains("canvas-note")) &&
        isEmpty(editor.content)
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

  /**
   * Changes the note being typed in to `color`, the way a new note in it
   * would be, as a change that can be undone.
   */
  colorTypingNote(color: ToolColor): void {
    const editing = this.#editing;
    if (editing?.kind !== "notes") {
      return;
    }
    const view = editing.view as unknown as NoteView;
    const noteColor = this.#getNoteColor(color);
    if (view.item.color === noteColor) {
      return;
    }
    const note = { ...view.item, color: noteColor };
    if (this.#layers.notes.isDraft(note.id)) {
      this.#layers.notes.updateDraft(note);
    } else {
      this.#options.onItemChange("notes", note);
      // Its color's changed already, so finishing typing only adds its text.
      editing.from = { ...editing.from, color: noteColor } as TypedItem;
    }
    this.#options.onEditingNote?.(noteColor);
  }

  // Tells the host no note's being typed in, once `kind` stops being.
  #stopEditingNote(kind: ItemKind): void {
    if (kind === "notes") {
      this.#options.onEditingNote?.(null);
    }
  }

  /** Puts focus back in what's being typed, e.g. once a color's picked. */
  focusTyping(): void {
    this.#editing?.view.editor.focus();
  }

  // Typing goes on while focus is in the text or the format bar.
  // Safari doesn't focus a button or slider that's pressed, so focus leaves
  // for nowhere. While one in the format bar, or a control that keeps typing
  // going, is pressed, that's where it's going, and the text gets focus back.
  #onEditingFocusOut = (event: FocusEvent): void => {
    const pressed = event.relatedTarget ? null : this.#pressed;
    const next = (event.relatedTarget ?? pressed) as Node | null;
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
    } else if (editing && pressed) {
      requestAnimationFrame(() => {
        if (this.#editing === editing && !isField(document.activeElement)) {
          editing.view.editor.focus();
        }
      });
    }
  };

  #onDocumentPress = (event: PointerEvent): void => {
    this.#pressed =
      event.type === "pointerdown" ? (event.target as Node) : null;
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
          this.#shareTyping();
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

  // Where an item is as it's moved or resized, for everyone drawing
  // together, until it's dropped.
  // Everything else picked moves along with an item being moved.
  #gestureOptions<T extends PlacedItem>(kind: ItemKind) {
    return {
      onGestureMove: ({ item }: ItemView<T>, from: T, resizing: boolean) => {
        const { x, y, width, height } = item as T & {
          width?: number | null;
          height?: number | null;
        };
        this.#options.onActivity?.({
          type: "move",
          kind,
          id: item.id,
          box: { x, y, width, height },
        });
        if (!resizing) {
          this.#moveSelectionWith(kind, item, from);
        }
      },
      onGestureEnd: () => {
        this.#showSnapGuides([]);
        this.#endGroupMove();
        this.#options.onActivity?.(null);
      },
      onDelete: (view: ItemView<T>) => this.#deleteItem(kind, view),
    };
  }

  /**
   * Shows what someone drawing together with this canvas is in the middle
   * of, or stops showing it once it's null: the stroke they're drawing, or
   * the item they're moving or typing in, outlined in their color.
   */
  setPeerActivity(peer: ActivityPeer, activity: Activity | null): void {
    const before = this.#peerActivities.get(peer.id)?.activity;
    if (activity) {
      this.#peerActivities.set(peer.id, { peer, activity });
    } else {
      this.#peerActivities.delete(peer.id);
    }
    // The item they had, if they've stopped, or moved on to another.
    if (
      before &&
      before.type !== "stroke" &&
      (!activity ||
        activity.type === "stroke" ||
        getActivityId(activity) !== getActivityId(before))
    ) {
      this.#showPeerItem(before.kind, getActivityId(before), null, peer);
    }
    if (activity?.type === "move") {
      const shown = this.#getShownItem(activity.kind, activity.id);
      if (shown) {
        this.#showPeerItem(
          activity.kind,
          activity.id,
          { ...shown, ...activity.box } as DrawingItem<ItemKind>,
          peer
        );
      }
    } else if (activity?.type === "typing") {
      const { kind, item } = activity;
      const shown = this.#getShownItem(kind, item.id);
      // One in the drawing keeps its own strokes and fills.
      this.#showPeerItem(
        kind,
        item.id,
        shown ? { ...shown, content: item.content } : item,
        peer
      );
    }
    if (before?.type === "stroke" || activity?.type === "stroke") {
      this.#paintPeerInk();
    }
  }

  // The item in the drawing, or as someone else is showing it, if there's
  // one with `id`.
  #getShownItem(kind: ItemKind, id: string): DrawingItem<ItemKind> | null {
    const layer = this.#getAnyLayer(kind);
    return (
      layer.items.find((item) => item.id === id) ??
      (layer.isPreviewOnly(id) ? (layer.getView(id)?.item ?? null) : null)
    );
  }

  #getAnyLayer(kind: ItemKind) {
    return this.#layers[kind] as unknown as ItemLayer<
      DrawingItem<ItemKind>,
      ItemView<DrawingItem<ItemKind>>
    >;
  }

  // Shows an item as `peer` has it, outlined in their color, or as it is in
  // the drawing once `item` is null. One that's only theirs so far can't be
  // pressed.
  #showPeerItem(
    kind: ItemKind,
    id: string,
    item: DrawingItem<ItemKind> | null,
    peer: ActivityPeer
  ): void {
    const layer = this.#getAnyLayer(kind);
    const before = layer.getView(id);
    const view = layer.setPreview(id, item);
    if (view) {
      view.element.style.setProperty("--canvas-peer-color", peer.color);
      view.element.toggleAttribute("data-peer", true);
      view.element.toggleAttribute("data-peer-only", layer.isPreviewOnly(id));
    } else if (before) {
      before.element.removeAttribute("data-peer");
      before.element.removeAttribute("data-peer-only");
    }
  }

  // Draws the strokes others are drawing over everything, in their colors,
  // at the zoom. Erasing shows as a faint trail in their color, since
  // there's nothing to show it erasing until it's done.
  #paintPeerInk(): void {
    const canvas = this.#peerInk;
    const strokes = [...this.#peerActivities.values()].filter(
      ({ activity }) => activity.type === "stroke"
    );
    if (strokes.length === 0) {
      canvas.remove();
      return;
    }
    if (!canvas.isConnected) {
      this.#items.after(canvas);
    }
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.round(this.#width * pixelRatio);
    const height = Math.round(this.#height * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    const { x, y, zoom } = this.#viewport;
    for (const { peer, activity } of strokes) {
      if (activity.type !== "stroke") {
        continue;
      }
      const origin = activity.note
        ? this.#layers.notes.getView(activity.note)?.item
        : { x: 0, y: 0 };
      if (!origin) {
        continue;
      }
      const scale = pixelRatio * zoom;
      context.setTransform(
        scale,
        0,
        0,
        scale,
        (origin.x - x) * scale,
        (origin.y - y) * scale
      );
      const { stroke } = activity;
      const erases = stroke.color === undefined;
      context.globalAlpha = erases ? 0.25 : 1;
      drawStroke(context, { ...stroke, color: stroke.color ?? peer.color });
    }
    context.globalAlpha = 1;
  }

  // Pressing text while it's being typed in moves the cursor. With the select
  // tool, pressing it picks it, and pressing it twice opens it for typing.
  // With the note or text tool, pressing it opens it.
  #typingOptions<T extends TypedItem>(kind: TypedKind) {
    return {
      isPressForBrowser: (view: TypedView<T>, target: Element) =>
        view.editor.isEditable && view.editor.element.contains(target),
      onPress: (view: TypedView<T>, extend: boolean) => {
        if (this.#moving) {
          this.#pressItem(kind, view, extend);
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
      { label: "Delete", onSelect: () => this.#deleteItem(kind, view) },
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
      this.#stopEditingNote(kind);
      this.#editing = null;
      this.#formatBar.close();
      this.#options.onActivity?.(null);
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
    menu
      .querySelector<HTMLButtonElement>(".canvas-menu-item:not(:disabled)")
      ?.focus();
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
          byline: null,
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
        this.#showByline(view);
        // What's being typed isn't in the drawing until typing stops, so
        // someone else's change mustn't replace it.
        if (this.#editing?.view !== view) {
          editor.setContent(item.content);
          this.#showEmpty(view as unknown as TypedView<TypedItem>);
        }
        this.#paintInk(view);
      },
      resize: (note, _size, handle, dx, dy, min) => {
        const box = resizeBox(note, handle, dx, dy, min);
        const shiftX = note.x - box.x;
        const shiftY = note.y - box.y;
        if (shiftX === 0 && shiftY === 0) {
          return { ...note, ...box };
        }
        const shift = <P extends Point>(point: P): P => ({
          ...point,
          x: point.x + shiftX,
          y: point.y + shiftY,
        });
        return {
          ...note,
          ...box,
          strokes: note.strokes.map((stroke) => ({
            ...stroke,
            points: stroke.points.map(shift),
          })),
          erasers: note.erasers.map((stroke) => ({
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
      snap: (_view, note, free) => this.#snapNote(note, free),
      ...this.#gestureOptions<Note>("notes"),
      ...this.#typingOptions<Note>("notes"),
      onChange: (note) => this.#changeItem("notes", note),
      onRemove: (id) => this.#options.onItemRemove("notes", id),
    });
  }

  // Who signed a note, along its bottom, once anyone has. More sign it as
  // they change it, and nobody's removed, so it's only ever added.
  #showByline(view: NoteView): void {
    const byline = getByline(view.item, this.#signerName);
    if (!byline) {
      return;
    }
    if (!view.byline) {
      view.byline = createElement("div", "canvas-note-byline");
      view.element.toggleAttribute("data-signed", true);
      // Straight after its text, so its ink stays above it, as exports draw
      // it.
      view.editor.element.after(view.byline);
    }
    if (view.byline.textContent !== byline) {
      view.byline.textContent = byline;
    }
  }

  // A note being moved lines up with the notes on screen near it, unless
  // Alt is held, and guides show what it lined up with.
  #snapNote(note: Note, free: boolean): Note {
    if (free) {
      this.#showSnapGuides([]);
      return note;
    }
    const area = this.visibleArea;
    const others = this.#layers.notes.views
      .map(({ item }) => item)
      .filter((other) => other.id !== note.id && intersectBoxes(other, area));
    const { x, y, guides } = snapBox(
      note,
      others,
      NOTE_SNAP.distance / this.#viewport.zoom,
      NOTE_SNAP.gap
    );
    this.#showSnapGuides(guides);
    return { ...note, x, y };
  }

  // Each guide is a line across or down the screen, a pixel thick at any
  // zoom.
  #showSnapGuides(guides: SnapGuide[]): void {
    const { x, y, zoom } = this.#viewport;
    this.#snapGuides.replaceChildren(
      ...guides.map(({ from, to }) => {
        const guide = createElement("div", "canvas-snap-guide");
        const left = (Math.min(from.x, to.x) - x) * zoom;
        const top = (Math.min(from.y, to.y) - y) * zoom;
        guide.style.left = px(left);
        guide.style.top = px(top);
        guide.style.width = px(Math.max(Math.abs(to.x - from.x) * zoom, 1));
        guide.style.height = px(Math.max(Math.abs(to.y - from.y) * zoom, 1));
        return guide;
      })
    );
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
      render: (view) => {
        const { element, item, editor } = view;
        element.style.left = px(item.x);
        element.style.top = px(item.y);
        element.style.width =
          item.width === null ? "max-content" : px(item.width);
        element.style.minHeight = item.height === null ? "" : px(item.height);
        element.style.fontSize = px(item.fontSize);
        element.style.color = item.color;
        element.toggleAttribute("data-wraps", item.width !== null);
        // What's being typed isn't in the drawing until typing stops, so
        // someone else's change mustn't replace it.
        if (this.#editing?.view !== view) {
          editor.setContent(item.content);
        }
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
      ...this.#gestureOptions<TextBox>("texts"),
      onChange: (box) => this.#changeItem("texts", box),
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
      onPress: (view, extend) => this.#pressItem("images", view, extend),
      onMenu: (view, point) => this.#openItemMenu("images", view, point),
      ...this.#gestureOptions<ImageItem>("images"),
      onChange: (item) => this.#changeItem("images", item),
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
