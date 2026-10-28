import { ZOOM } from "../constants/zoom.const";
import { type Box } from "../models/box.model";
import { type Point } from "../models/point.model";
import { type Size } from "../models/size.model";
import { type Stroke } from "../models/stroke.model";
import { type Viewport } from "../models/viewport.model";

/** The 100% view, with the drawing's origin at the top left. */
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, zoom));
}

/** Where `point`, in pixels from the canvas's top left, is on the drawing. */
export function toDrawingPoint({ x, y, zoom }: Viewport, point: Point): Point {
  return { x: x + point.x / zoom, y: y + point.y / zoom };
}

/**
 * The viewport at `zoom`, keeping the drawing under `point` where it is, e.g.
 * under the pointer. `point` is in pixels from the canvas's top left.
 */
export function zoomAround(
  viewport: Viewport,
  zoom: number,
  point: Point
): Viewport {
  const next = clampZoom(zoom);
  const fixed = toDrawingPoint(viewport, point);
  return {
    x: fixed.x - point.x / next,
    y: fixed.y - point.y / next,
    zoom: next,
  };
}

/** The viewport moved by `dx` and `dy` pixels, as if the drawing were dragged. */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return {
    ...viewport,
    x: viewport.x - dx / viewport.zoom,
    y: viewport.y - dy / viewport.zoom,
  };
}

/** The next zoom step in or out from `zoom`. */
export function stepZoom(zoom: number, direction: "in" | "out"): number {
  // A little leeway, so a zoom just off a step doesn't stop on it.
  const steps =
    direction === "in"
      ? ZOOM.steps.filter((step) => step > zoom * 1.01)
      : ZOOM.steps.filter((step) => step < zoom / 1.01).reverse();
  return steps[0] ?? zoom;
}

/** The part of the drawing a canvas `size` pixels big shows. */
export function getVisibleArea({ x, y, zoom }: Viewport, size: Size): Box {
  return { x, y, width: size.width / zoom, height: size.height / zoom };
}

/** The smallest box around all of `boxes`, or null if there are none. */
export function unionBoxes(boxes: Box[]): Box | null {
  if (boxes.length === 0) {
    return null;
  }
  const left = Math.min(...boxes.map(({ x }) => x));
  const top = Math.min(...boxes.map(({ y }) => y));
  const right = Math.max(...boxes.map(({ x, width }) => x + width));
  const bottom = Math.max(...boxes.map(({ y, height }) => y + height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The box around a stroke, including its width. */
export function getStrokeBox({ points, size }: Stroke): Box | null {
  if (points.length === 0) {
    return null;
  }
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const left = Math.min(...xs) - size;
  const top = Math.min(...ys) - size;
  return {
    x: left,
    y: top,
    width: Math.max(...xs) + size - left,
    height: Math.max(...ys) + size - top,
  };
}

/**
 * The viewport that shows all of `box`, centered, with room around it, on a
 * canvas `size` pixels big. Without a box, it's the 100% view.
 */
export function fitViewport(box: Box | null, size: Size): Viewport {
  if (!box || size.width <= 0 || size.height <= 0) {
    return DEFAULT_VIEWPORT;
  }
  const room = 1 - ZOOM.fitMargin * 2;
  const zoom = clampZoom(
    Math.min(
      (size.width * room) / Math.max(box.width, 1),
      (size.height * room) / Math.max(box.height, 1)
    )
  );
  return {
    x: box.x + box.width / 2 - size.width / zoom / 2,
    y: box.y + box.height / 2 - size.height / zoom / 2,
    zoom,
  };
}
