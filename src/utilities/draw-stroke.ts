import { Stroke } from "../models/stroke.model";

/**
 * Draws a stroke onto the canvas. Pass `startIndex` to draw only the segments
 * after that point, which is used to extend a stroke while it is in progress.
 */
export function drawStroke(
  context: CanvasRenderingContext2D,
  { color, points, size }: Stroke,
  startIndex = 0
): void {
  if (points.length === 0) {
    return;
  }

  // Erasing only cares about alpha, so any opaque color works.
  context.globalCompositeOperation =
    color === undefined ? "destination-out" : "source-over";
  context.fillStyle = color ?? "#000000";
  context.strokeStyle = color ?? "#000000";

  if (points.length === 1) {
    const [{ x, y }] = points;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
    return;
  }

  const start = Math.max(startIndex, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = size * 2;
  context.beginPath();
  context.moveTo(points[start].x, points[start].y);
  for (const { x, y } of points.slice(start + 1)) {
    context.lineTo(x, y);
  }
  context.stroke();
}
