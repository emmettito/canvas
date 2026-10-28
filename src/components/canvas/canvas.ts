import { type Point } from "../../models/point.model";
import { type Stroke } from "../../models/stroke.model";
import { type ToolState } from "../../models/tool-state.model";
import { createElement } from "../../utilities/create-element";
import { drawStroke } from "../../utilities/draw-stroke";
import { getCssVariable } from "../../utilities/get-css-variable";
import "./canvas.css";

// What is currently drawn on the canvas.
interface Painted {
  height: number;
  width: number;
  strokes: Stroke[];
}

function startsWith(strokes: Stroke[], prefix: Stroke[]): boolean {
  return (
    prefix.length <= strokes.length &&
    prefix.every((stroke, index) => stroke === strokes[index])
  );
}

/** The drawing surface. Strokes are drawn with the current tool. */
export class Canvas {
  // The interface layer sits above the canvas and handles all pointer input.
  #interfaceLayer = createElement("div", "canvas-input-layer");
  #canvas = createElement("canvas", "canvas-drawing");
  #cursor = createElement("div", "canvas-cursor");
  #height = 0;
  #width = 0;
  #strokes: Stroke[] = [];
  #toolState: ToolState;
  #onStrokeComplete: (stroke: Stroke) => void;
  #stroke: Stroke | null = null;
  #painted: Painted | null = null;

  constructor(
    container: HTMLElement,
    toolState: ToolState,
    onStrokeComplete: (stroke: Stroke) => void
  ) {
    this.#toolState = toolState;
    this.#onStrokeComplete = onStrokeComplete;

    const layer = this.#interfaceLayer;
    layer.addEventListener("pointerdown", this.#onPointerDown);
    layer.addEventListener("pointermove", this.#onPointerMove);
    layer.addEventListener("pointerup", this.#onPointerUp);
    layer.addEventListener("pointercancel", this.#onPointerUp);
    layer.addEventListener("pointerleave", this.#onPointerLeave);
    layer.addEventListener("contextmenu", (event) => event.preventDefault());
    container.append(layer, this.#canvas, this.#cursor);
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

  setToolState(toolState: ToolState): void {
    this.#toolState = toolState;
  }

  #paint(): void {
    const canvas = this.#canvas;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const height = this.#height;
    const width = this.#width;
    const strokes = this.#strokes;
    const painted = this.#painted;
    this.#painted = { height, width, strokes };

    // Strokes that were only added, e.g. by redo, can be drawn on top.
    if (
      painted &&
      painted.height === height &&
      painted.width === width &&
      startsWith(strokes, painted.strokes)
    ) {
      for (const stroke of strokes.slice(painted.strokes.length)) {
        drawStroke(context, stroke);
      }
      return;
    }

    // Resizing clears the canvas, so everything is redrawn.
    // Scale canvas for HD
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.scale(scale, scale);
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
    const { left, top } = this.#interfaceLayer.getBoundingClientRect();
    return { x: event.clientX - left, y: event.clientY - top };
  }

  #moveCursor(event: PointerEvent): void {
    const cursor = this.#cursor;
    // Touch and pen have no hover position, so the cursor only follows a mouse.
    if (event.pointerType !== "mouse") {
      cursor.style.visibility = "hidden";
      return;
    }
    const { x, y } = this.#getPoint(event);
    const size = this.#toolState.size * 2;
    cursor.style.visibility = "visible";
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    cursor.style.width = `${size}px`;
    cursor.style.height = `${size}px`;
  }

  #onPointerDown = (event: PointerEvent): void => {
    const context = this.#getContext();
    if (!context || !event.isPrimary || event.button !== 0) {
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
    this.#onStrokeComplete(stroke);
  };

  #onPointerLeave = (): void => {
    this.#cursor.style.visibility = "hidden";
  };
}
