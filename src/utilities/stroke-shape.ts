import { type Box } from "../models/box.model";
import { type Point } from "../models/point.model";
import { type Stroke } from "../models/stroke.model";
import { getDistanceToLine, getDistanceToStroke } from "./erase-strokes";
import { getPointReach } from "./stroke-pieces";

/** Whether a stroke is drawn at a point, or within `slack` of it. */
export function isStrokeAt(stroke: Stroke, point: Point, slack = 0): boolean {
  return getDistanceToStroke(point, stroke) <= getPointReach(stroke) + slack;
}

function isInBox({ x, y }: Point, box: Box, reach: number): boolean {
  return (
    x >= box.x - reach &&
    x <= box.x + box.width + reach &&
    y >= box.y - reach &&
    y <= box.y + box.height + reach
  );
}

/** Whether any of a stroke is drawn inside a box. */
export function isStrokeInBox(stroke: Stroke, box: Box): boolean {
  const { points } = stroke;
  const reach = getPointReach(stroke);
  if (points.some((point) => isInBox(point, box, reach))) {
    return true;
  }
  // A line can cross the box without a point inside it.
  const { x, y, width, height } = box;
  const corners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  return points.some((point, index) => {
    const before = points[index - 1];
    return (
      before !== undefined &&
      corners.some(
        (corner, side) =>
          isCrossing(before, point, corner, corners[(side + 1) % 4]) ||
          getDistanceToLine(corner, before, point) <= reach
      )
    );
  });
}

function getSide(a: Point, b: Point, point: Point): number {
  return Math.sign(
    (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
  );
}

function isCrossing(a: Point, b: Point, c: Point, d: Point): boolean {
  return (
    getSide(a, b, c) !== getSide(a, b, d) &&
    getSide(c, d, a) !== getSide(c, d, b)
  );
}

/** A stroke `dx` and `dy` further on. */
export function moveStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({
      ...point,
      x: point.x + dx,
      y: point.y + dy,
    })),
  };
}

/**
 * A stroke stretched from the box `from` to the box `to`. Its line gets
 * thicker or thinner with it, as much as its area grows or shrinks.
 */
export function resizeStroke(stroke: Stroke, from: Box, to: Box): Stroke {
  const scaleX = from.width > 0 ? to.width / from.width : 1;
  const scaleY = from.height > 0 ? to.height / from.height : 1;
  return {
    ...stroke,
    size: stroke.size * Math.sqrt(scaleX * scaleY),
    points: stroke.points.map((point) => ({
      ...point,
      x: to.x + (point.x - from.x) * scaleX,
      y: to.y + (point.y - from.y) * scaleY,
    })),
  };
}
