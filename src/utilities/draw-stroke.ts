import { type Stroke } from "../models/stroke.model";
import {
  getDotSize,
  getSquareOutlines,
  getStrokePieces,
  hasPressure,
} from "./stroke-pieces";

/**
 * Draws a stroke onto the canvas, smoothed through its points. Pass `from`
 * and `end` to draw only some of its pieces (see `getStrokePieces`), e.g.
 * what a point just added adds while it's drawn, and its end once it's done.
 * A see-through stroke is drawn all at once, so where it crosses itself
 * isn't any darker.
 */
export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  { from = 1, end = true }: { from?: number; end?: boolean } = {}
): void {
  const { color, points, opacity, cap } = stroke;
  if (points.length === 0 || (points.length === 1 && from > 1)) {
    return;
  }

  // Erasing only cares about alpha, so any opaque color works.
  context.globalCompositeOperation =
    color === undefined ? "destination-out" : "source-over";
  context.fillStyle = color ?? "#000000";
  context.strokeStyle = color ?? "#000000";
  if (opacity !== undefined) {
    context.save();
    context.globalAlpha *= opacity;
  }

  if (points.length === 1) {
    const [{ x, y }] = points;
    const radius = getDotSize(stroke);
    context.beginPath();
    if (cap === "square") {
      context.rect(x - radius, y - radius, radius * 2, radius * 2);
    } else {
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
    context.fill();
  } else if (cap === "square") {
    // Filled at once, so where its outlines overlap isn't any darker.
    context.beginPath();
    getSquareOutlines(stroke, from, end).forEach(([first, ...rest]) => {
      context.moveTo(first.x, first.y);
      rest.forEach(({ x, y }) => context.lineTo(x, y));
      context.closePath();
    });
    context.fill();
  } else {
    context.lineCap = "round";
    context.lineJoin = "round";
    const pieces = getStrokePieces(stroke, from, end);
    // A pen's pieces are each as wide as it pressed, and the rest are one
    // line.
    const separate = hasPressure(stroke);
    pieces.forEach(({ from: start, control, to, size }, index) => {
      if (separate || index === 0) {
        context.beginPath();
        context.lineWidth = size * 2;
        context.moveTo(start.x, start.y);
      }
      if (control) {
        context.quadraticCurveTo(control.x, control.y, to.x, to.y);
      } else {
        context.lineTo(to.x, to.y);
      }
      if (separate || index === pieces.length - 1) {
        context.stroke();
      }
    });
  }

  if (opacity !== undefined) {
    context.restore();
  }
}
