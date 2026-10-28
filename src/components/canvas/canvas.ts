import { IMAGE_LAYOUT } from "../../constants/image-layout.const";
import { NOTE_LAYOUT } from "../../constants/note-layout.const";
import { RESIZE_HANDLES } from "../../constants/resize-handles.const";
import { TEXT_LAYOUT } from "../../constants/text-layout.const";
import { ZOOM } from "../../constants/zoom.const";
import { type Box } from "../../models/box.model";
import { type Color } from "../../models/color.model";
import {
  type Drawing,
  type DrawingItem,
  type ItemKind,
} from "../../models/drawing.model";
import { type ExportOptions } from "../../models/export-options.model";
import { type ImageItem } from "../../models/image-item.model";
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
import { drawStroke } from "../../utilities/draw-stroke";
import { exportDrawing } from "../../utilities/export-drawing";
import { getCssVariable } from "../../utilities/get-css-variable";
import { getNoteColor } from "../../utilities/lighten-color";
import { resizeBox, resizeBoxKeepingShape } from "../../utilities/resize-box";
import { isField } from "../../utilities/is-field";
import { isBlank } from "../../utilities/rich-text";
import {
  DEFAULT_VIEWPORT,
  fitViewport,
  getStrokeBox,
  getVisibleArea,
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
  // An image's file, or null if it's missing.
  getImage: (id: string) => Promise<Blob | null>;
  // Makes the editor notes and text are shown and typed in with.
  createTextEditor: TextEditorFactory;
  // The canvas was zoomed or panned, e.g. by scrolling.
  onViewportChange: (viewport: Viewport) => void;
}

/** What pressing the canvas places, instead of drawing. */
export type Placing =
  | { kind: "notes"; color: Color }
  | { kind: "texts"; color: Color; fontSize: number };

// A note or text box, which is typed in.
type TypedItem = PlacedItem & { content: RichText };

interface TypedView<T extends TypedItem> extends ItemView<T> {
  editor: TextEditor;
}

// Which items are typed in.
type TypedKind = "notes" | "texts";

// An action in an item's menu.
interface MenuAction {
  label: string;
  onSelect: () => void;
}

interface ImageView extends ItemView<ImageItem> {
  image: HTMLImageElement;
}

// What is currently drawn on the canvas.
interface Painted {
  height: number;
  width: number;
  viewport: Viewport;
  strokes: Stroke[];
}

// Safari's pinch on a trackpad, which isn't a wheel event as elsewhere.
interface GestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

function startsWith(strokes: Stroke[], prefix: Stroke[]): boolean {
  return (
    prefix.length <= strokes.length &&
    prefix.every((stroke, index) => stroke === strokes[index])
  );
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
  #canvas = createElement("canvas", "canvas-drawing");
  #cursor = createElement("div", "canvas-cursor");
  // Above the input layer, so items get pointer input themselves.
  #items = createElement("div", "canvas-items");
  // The drawing as it's shown: its background, strokes and items, and the
  // input on them. A theme can filter it, e.g. to show it dark.
  #surface = createElement("div", "canvas-surface");
  // Controls over the drawing, e.g. the format bar, which aren't filtered.
  #overlay = createElement("div", "canvas-overlay");
  #height = 0;
  #width = 0;
  #strokes: Stroke[] = [];
  #layers: {
    images: ItemLayer<ImageItem, ImageView>;
    texts: ItemLayer<TextBox, TypedView<TextBox>>;
    notes: ItemLayer<Note, TypedView<Note>>;
  };
  // Images' files as object URLs, by id, once they're loaded.
  #imageUrls = new Map<string, Promise<string | null>>();
  // Whether releasing the press places an item. Pressing the canvas to stop
  // typing in one doesn't.
  #placesOnRelease = false;
  // The note or text being typed in, which the format bar formats.
  #editing: { kind: TypedKind; view: TypedView<TypedItem> } | null = null;
  #formatBar = new FormatBar();
  // An item's menu, while it's open.
  #menu: HTMLElement | null = null;
  #toolState: ToolState;
  #placing: Placing | null = null;
  #options: CanvasOptions;
  #stroke: Stroke | null = null;
  #painted: Painted | null = null;
  #viewport: Viewport = DEFAULT_VIEWPORT;
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
      this.#layers.images.element,
      this.#layers.texts.element,
      this.#layers.notes.element
    );
    this.#surface.append(layer, this.#canvas, this.#items, this.#cursor);
    this.#overlay.append(this.#formatBar.element);
    container.append(this.#surface, this.#overlay);

    const surface = this.#surface;
    surface.addEventListener("wheel", this.#onWheel, { passive: false });
    surface.addEventListener("gesturestart", this.#onGestureStart);
    surface.addEventListener("gesturechange", this.#onGestureChange);
    // Before the drawing and items get them, so panning and pinching don't
    // also draw or drag.
    surface.addEventListener("pointerdown", this.#onSurfaceDown, true);
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

  setStrokes(strokes: Stroke[]): void {
    // Called on every toolbar change, so skip the paint if nothing changed.
    if (strokes === this.#strokes) {
      return;
    }
    this.#strokes = strokes;
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
    const layer = this.#interfaceLayer;
    if (placing) {
      layer.dataset.placing = placing.kind;
    } else {
      delete layer.dataset.placing;
    }
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
    // The canvas color comes from CSS, so the drawing doesn't have it.
    const background = getCssVariable(
      this.#interfaceLayer,
      "--canvas-color-canvas"
    );
    const textStyle = {
      noteColor: getCssVariable(
        this.#interfaceLayer,
        "--canvas-color-note-text"
      ),
      fontFamily: getComputedStyle(this.#items).fontFamily,
    };
    const drawing: Drawing = {
      strokes: this.#strokes,
      images: this.#layers.images.items,
      texts: this.#layers.texts.items,
      notes: this.#layers.notes.items,
    };
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
      background,
      textStyle,
      files
    );
  }

  #paint(): void {
    const canvas = this.#canvas;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const height = this.#height;
    const width = this.#width;
    const viewport = this.#viewport;
    const strokes = this.#strokes;
    const painted = this.#painted;
    this.#painted = { height, width, viewport, strokes };

    // Strokes that were only added, e.g. by redo, can be drawn on top.
    if (
      painted &&
      painted.height === height &&
      painted.width === width &&
      painted.viewport === viewport &&
      startsWith(strokes, painted.strokes)
    ) {
      for (const stroke of strokes.slice(painted.strokes.length)) {
        drawStroke(context, stroke);
      }
      return;
    }

    // Everything is drawn again, at the screen's resolution, through the
    // viewport. Resizing clears the canvas, and otherwise it's cleared.
    const pixelRatio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = px(width);
      canvas.style.height = px(height);
    } else {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, pixelWidth, pixelHeight);
    }
    const scale = pixelRatio * viewport.zoom;
    context.setTransform(
      scale,
      0,
      0,
      scale,
      -viewport.x * scale,
      -viewport.y * scale
    );
    for (const stroke of strokes) {
      drawStroke(context, stroke);
    }
    // Keep a stroke in progress, e.g. if the window resizes mid-stroke.
    if (this.#stroke) {
      drawStroke(context, this.#stroke);
    }
  }

  #getContext(): CanvasRenderingContext2D | null {
    return this.#canvas.getContext("2d");
  }

  #getPoint(event: PointerEvent): Point {
    return this.getDrawingPoint(event.clientX, event.clientY);
  }

  #moveCursor(event: PointerEvent): void {
    const cursor = this.#cursor;
    // Touch and pen have no hover position, so the cursor only follows a
    // mouse. Placing items has no size to show.
    if (event.pointerType !== "mouse" || this.#placing) {
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
    const context = this.#getContext();
    if (!context || !event.isPrimary || event.button !== 0) {
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
    const { color, size } = this.#toolState;
    // Capture keeps the stroke going if the pointer leaves the canvas.
    this.#interfaceLayer.setPointerCapture(event.pointerId);
    this.#stroke = {
      color:
        color === undefined
          ? undefined
          : getCssVariable(this.#interfaceLayer, color),
      points: [this.#getPoint(event)],
      size,
    };
    drawStroke(context, this.#stroke);
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (!event.isPrimary) {
      return;
    }
    this.#moveCursor(event);
    const stroke = this.#stroke;
    const context = this.#getContext();
    if (!stroke || !context) {
      return;
    }
    stroke.points.push(this.#getPoint(event));
    drawStroke(context, stroke, stroke.points.length - 2);
  };

  #onPointerUp = (event: PointerEvent): void => {
    if (this.#placesOnRelease && event.isPrimary) {
      this.#placesOnRelease = false;
      if (event.type === "pointerup" && this.#placing) {
        this.#placeDraft(this.#getPoint(event), this.#placing);
      }
      return;
    }
    const stroke = this.#stroke;
    if (!event.isPrimary || !stroke) {
      return;
    }
    this.#stroke = null;
    // The stroke is already drawn, so it shouldn't be drawn again once added.
    const painted = this.#painted;
    if (painted) {
      this.#painted = {
        ...painted,
        strokes: [...painted.strokes, stroke],
      };
    }
    this.#options.onStrokeComplete(stroke);
  };

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
    if (this.#stroke) {
      this.#stroke = null;
      this.#painted = null;
      this.#paint();
    }
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
        this.#placesOnRelease = false;
        for (const layer of Object.values(this.#layers)) {
          layer.cancelGesture();
        }
        this.#pinch = this.#measurePinch();
      }
      if (this.#pinch) {
        event.stopPropagation();
      }
      return;
    }
    if (event.button === 1 || (event.button === 0 && this.#spaceHeld)) {
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
    const color = getCssVariable(this.#interfaceLayer, placing.color);
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
      });
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
    this.#editing = { kind, view: typed };
    view.element.toggleAttribute("data-editing", true);
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
    } else if (JSON.stringify(content) !== JSON.stringify(view.item.content)) {
      this.#options.onItemChange(kind, item as never);
    }
  }

  // Typing goes on while focus is in the text or the format bar.
  #onEditingFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    const editing = this.#editing;
    if (
      editing &&
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
        if (this.#editing?.view.editor === editor) {
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

  // Pressing text while it's being typed in moves the cursor, and opens it
  // for typing otherwise.
  #typingOptions<T extends TypedItem>(kind: TypedKind) {
    return {
      isPressForBrowser: (view: TypedView<T>, target: Element) =>
        view.editor.isEditable && view.editor.element.contains(target),
      onPress: (view: TypedView<T>) => this.#startEditing(kind, view),
      onMenu: (view: TypedView<T>, point: Point) =>
        this.#openMenu(point, [
          { label: "Delete", onSelect: () => this.#delete(kind, view) },
        ]),
      destroyView: (view: TypedView<T>) => view.editor.destroy(),
    };
  }

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
    for (const { label, onSelect } of actions) {
      const item = createElement("button", "canvas-menu-item");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.textContent = label;
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
    menu.querySelector("button")?.focus();
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

  #createNoteLayer(): ItemLayer<Note, TypedView<Note>> {
    return new ItemLayer<Note, TypedView<Note>>("canvas-notes", {
      className: "canvas-note",
      getZoom: () => this.#viewport.zoom,
      handles: RESIZE_HANDLES,
      createView: (note, element) => {
        const editor = this.#createEditor("notes", note, "Sticky note");
        element.append(editor.element);
        return { element, item: note, editor };
      },
      render: ({ element, item, editor }) => {
        element.style.left = px(item.x);
        element.style.top = px(item.y);
        element.style.width = px(item.width);
        element.style.height = px(item.height);
        element.style.backgroundColor = item.color;
        editor.setContent(item.content);
      },
      resize: (note, _size, handle, dx, dy, min) => ({
        ...note,
        ...resizeBox(note, handle, dx, dy, min),
      }),
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
      onMenu: (view, point) =>
        this.#openMenu(point, [
          { label: "Delete", onSelect: () => this.#delete("images", view) },
        ]),
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
