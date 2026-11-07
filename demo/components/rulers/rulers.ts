import { RULER_LAYOUT } from "../../constants/ruler-layout.const";
import { type Point, type Viewport } from "@emmettito/canvas";
import { createElement } from "../../utilities/create-element";
import { getCssVariable } from "../../utilities/get-css-variable";
import { getTicks, getTickSpacing } from "../../utilities/ruler-ticks";
import "./rulers.css";

// What a ruler's drawn in, from the page's CSS.
interface RulerStyle {
  surface: string;
  border: string;
  text: string;
  accent: string;
  font: string;
}

export interface RulersOptions {
  getViewport: () => Viewport;
  // The corner was pressed, to go back to where the drawing started.
  onGoToOrigin: () => void;
}

/**
 * Rulers along the top and left edges of the canvas, in drawing units, with
 * 0 at the drawing's origin, so it's clear where on the drawing the canvas
 * is. Each marks where the pointer is, or the middle of the view while it's
 * off the canvas, and the corner where they meet goes back to the origin.
 * They're drawn again on the next frame after anything they show changes.
 */
export class Rulers {
  readonly element = createElement("div", "canvas-rulers");
  #top = createElement("canvas", "canvas-ruler canvas-ruler-top");
  #left = createElement("canvas", "canvas-ruler canvas-ruler-left");
  #corner = createElement("button", "canvas-ruler-corner");
  #getViewport: () => Viewport;
  // Where the pointer is on screen, or null while it's off the canvas. It's
  // kept on screen, rather than on the drawing, so it stays put as the
  // drawing pans under it.
  #pointer: Point | null = null;
  #frame: number | null = null;

  constructor({ getViewport, onGoToOrigin }: RulersOptions) {
    this.#getViewport = getViewport;
    this.element.hidden = true;
    // They only show what's on screen, so they're hidden from screen readers.
    this.#top.setAttribute("aria-hidden", "true");
    this.#left.setAttribute("aria-hidden", "true");
    const label = "Go to origin";
    this.#corner.type = "button";
    this.#corner.setAttribute("aria-label", label);
    const tooltip = createElement("span", "canvas-tooltip");
    tooltip.textContent = label;
    tooltip.setAttribute("aria-hidden", "true");
    this.#corner.append(tooltip);
    this.#corner.addEventListener("click", onGoToOrigin);
  }

  get shown(): boolean {
    return !this.element.hidden;
  }

  // Their canvases are only in the page while they're shown, so the drawing's
  // the only canvas there otherwise.
  set shown(shown: boolean) {
    this.element.hidden = !shown;
    this.element.replaceChildren(
      ...(shown ? [this.#top, this.#left, this.#corner] : [])
    );
    this.refresh();
  }

  /** Marks the pointer at `client`, in the page's pixels, or null off the canvas. */
  setPointer(client: Point | null): void {
    this.#pointer = client;
    this.refresh();
  }

  /** Draws them again on the next frame, e.g. once the view has changed. */
  refresh(): void {
    if (!this.shown || this.#frame !== null) {
      return;
    }
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#draw();
    });
  }

  destroy(): void {
    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
    }
    this.element.remove();
  }

  #draw(): void {
    const viewport = this.#getViewport();
    const box = this.element.getBoundingClientRect();
    // Off the canvas, the middle of the view, muted, so it's still clear
    // where it is.
    const onScreen = this.#pointer ?? {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
    };
    const style = this.#getStyle();
    const color = this.#pointer ? style.accent : style.text;
    this.#drawRuler(this.#top, "x", viewport, style, {
      value: viewport.x + (onScreen.x - box.left) / viewport.zoom,
      color,
    });
    this.#drawRuler(this.#left, "y", viewport, style, {
      value: viewport.y + (onScreen.y - box.top) / viewport.zoom,
      color,
    });
  }

  #getStyle(): RulerStyle {
    const element = this.element;
    return {
      surface: getCssVariable(element, "--canvas-color-surface"),
      border: getCssVariable(element, "--canvas-color-border"),
      text: getCssVariable(element, "--canvas-color-text-muted"),
      accent: getCssVariable(element, "--canvas-color-accent"),
      font: `${RULER_LAYOUT.fontSize}px ${getComputedStyle(element).fontFamily}`,
    };
  }

  // Both rulers are drawn as the top one: along its length, with ticks
  // hanging from the edge beside the canvas. The left one is turned a
  // quarter turn, so it reads from bottom to top.
  #drawRuler(
    canvas: HTMLCanvasElement,
    axis: "x" | "y",
    viewport: Viewport,
    style: RulerStyle,
    marked: { value: number; color: string }
  ): void {
    const across = axis === "x";
    const length = across ? canvas.clientWidth : canvas.clientHeight;
    const thickness = across ? canvas.clientHeight : canvas.clientWidth;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round((across ? length : thickness) * ratio);
    canvas.height = Math.round((across ? thickness : length) * ratio);
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.scale(ratio, ratio);
    if (!across) {
      context.translate(0, length);
      context.rotate(-Math.PI / 2);
    }
    // How far along the ruler a drawing position is, from the start of the
    // drawing's axis, which is the bottom of the left ruler.
    const { zoom } = viewport;
    const start = viewport[axis];
    const toPosition = (value: number) => {
      const offset = (value - start) * zoom;
      return across ? offset : length - offset;
    };
    // Where the marked position's label goes, centered on it.
    const getMarker = (value: number) => {
      const position = Math.round(toPosition(value));
      const label = String(Math.round(value));
      const half =
        context.measureText(label).width / 2 + RULER_LAYOUT.markerPadding;
      return { position, label, from: position - half, to: position + half };
    };

    context.fillStyle = style.surface;
    context.fillRect(0, 0, length, thickness);
    context.fillStyle = style.border;
    context.fillRect(0, thickness - 1, length, 1);

    const { step, minor } = getTickSpacing(zoom, RULER_LAYOUT.minGap);
    const end = start + length / zoom;
    // From a step before the start, so a label partly off the start shows.
    context.fillStyle = style.text;
    for (const value of getTicks(start - step, end, minor)) {
      const major = isMultiple(value, step);
      const size = major ? RULER_LAYOUT.majorTick : RULER_LAYOUT.minorTick;
      context.fillRect(
        Math.round(toPosition(value)),
        thickness - 1 - size,
        1,
        size
      );
    }
    context.font = style.font;
    context.textBaseline = "middle";
    const labelY = (thickness - 1 - RULER_LAYOUT.majorTick) / 2;
    // The marked position is labeled on a line that marks it, and the labels
    // it would cover are left out.
    const marker = getMarker(marked.value);
    for (const value of getTicks(start - step, end, step)) {
      // After the tick, which, turned, is above it on the left ruler.
      const label = String(value);
      const from = Math.round(toPosition(value)) + RULER_LAYOUT.labelGap;
      const to = from + context.measureText(label).width;
      if (to < marker.from || from > marker.to) {
        context.fillText(label, from, labelY);
      }
    }
    context.fillStyle = style.surface;
    context.fillRect(marker.from, 0, marker.to - marker.from, thickness - 1);
    context.fillStyle = marked.color;
    context.fillRect(marker.position, 0, 1, thickness - 1);
    context.fillRect(
      marker.from,
      0,
      marker.to - marker.from,
      thickness - 1 - RULER_LAYOUT.majorTick
    );
    context.fillStyle = style.surface;
    context.textAlign = "center";
    context.fillText(marker.label, marker.position, labelY);
  }
}

// Within rounding, since the steps can be fractions.
function isMultiple(value: number, step: number): boolean {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}
