import { SHAPE_LAYOUT } from "../constants/shape-layout.const";
import { type Box } from "../models/box.model";
import { type Point } from "../models/point.model";
import { type ResizeHandle } from "../models/resize-handle.model";
import { type Shape } from "../models/shape.model";
import { type Size } from "../models/size.model";
import { resizeBox } from "./resize-box";

/** Whether it's a line or arrow, which goes from one point to another. */
export function isLine({ type }: Shape): boolean {
  return type === "line" || type === "arrow";
}

/** The box a shape fills, or a line goes across, without its outline. */
export function getShapeBox({ x, y, width, height }: Shape): Box {
  return {
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

/** The box around a shape, including its outline. */
export function getShapeBounds(shape: Shape): Box {
  const box = getShapeBox(shape);
  // An arrowhead reaches further than half the line's width, but no further
  // than its own length, which is shorter than the line.
  const reach =
    shape.strokeWidth / 2 +
    (shape.type === "arrow" ? getArrowLength(shape) : 0);
  return {
    x: box.x - reach,
    y: box.y - reach,
    width: box.width + reach * 2,
    height: box.height + reach * 2,
  };
}

function getArrowLength(shape: Shape): number {
  const { arrowLength, arrowScale, arrowMaxShare } = SHAPE_LAYOUT;
  return Math.min(
    Math.max(arrowLength, shape.strokeWidth * arrowScale),
    Math.hypot(shape.width, shape.height) * arrowMaxShare
  );
}

// Two decimal places is far finer than a pixel, and keeps paths short.
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A shape's outline, or its line and arrowhead, as SVG path data, from
 * `origin`, e.g. the top left corner of the element it's drawn in. A path
 * suits SVG and the canvas alike, which draws it as a `Path2D`.
 */
export function getShapePath(
  shape: Shape,
  origin: Point = { x: 0, y: 0 }
): string {
  const at = (x: number, y: number) =>
    `${round(x - origin.x)} ${round(y - origin.y)}`;
  const { x, y, width, height } = shape;
  switch (shape.type) {
    case "rectangle":
      return `M${at(x, y)}L${at(x + width, y)}L${at(x + width, y + height)}L${at(x, y + height)}Z`;
    case "ellipse": {
      const rx = round(width / 2);
      const ry = round(height / 2);
      const middle = y + height / 2;
      // Two halves, since one arc can't go all the way round.
      return `M${at(x, middle)}A${rx} ${ry} 0 1 0 ${at(x + width, middle)}A${rx} ${ry} 0 1 0 ${at(x, middle)}Z`;
    }
    case "line":
    case "arrow": {
      const line = `M${at(x, y)}L${at(x + width, y + height)}`;
      if (shape.type === "line" || (width === 0 && height === 0)) {
        return line;
      }
      // Its head's two sides, back from its end either side of the line.
      const angle = Math.atan2(height, width);
      const length = getArrowLength(shape);
      const side = (turn: number) =>
        at(
          x + width - length * Math.cos(angle + turn),
          y + height - length * Math.sin(angle + turn)
        );
      const { arrowAngle } = SHAPE_LAYOUT;
      return `${line}M${side(-arrowAngle)}L${at(x + width, y + height)}L${side(arrowAngle)}`;
    }
  }
}

/** Whether a point is inside a rectangle or ellipse. Lines have no inside. */
export function isInsideShape(shape: Shape, { x, y }: Point): boolean {
  const box = getShapeBox(shape);
  if (shape.type === "rectangle") {
    return (
      x >= box.x &&
      x <= box.x + box.width &&
      y >= box.y &&
      y <= box.y + box.height
    );
  }
  if (shape.type === "ellipse") {
    const rx = box.width / 2;
    const ry = box.height / 2;
    return (
      rx > 0 &&
      ry > 0 &&
      ((x - box.x - rx) / rx) ** 2 + ((y - box.y - ry) / ry) ** 2 <= 1
    );
  }
  return false;
}

// How far a point is from the segment between `a` and `b`.
function getDistanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
          )
        );
  return Math.hypot(point.x - a.x - along * dx, point.y - a.y - along * dy);
}

/**
 * Whether pressing `point` presses the shape: within `slop` of its line or
 * outline, or anywhere inside a filled one, as it shows.
 */
export function hitsShape(shape: Shape, point: Point, slop: number): boolean {
  const reach = slop + shape.strokeWidth / 2;
  const { x, y, width, height } = shape;
  if (isLine(shape)) {
    return (
      getDistanceToSegment(point, { x, y }, { x: x + width, y: y + height }) <=
      reach
    );
  }
  if (shape.fill !== null && isInsideShape(shape, point)) {
    return true;
  }
  const box = getShapeBox(shape);
  if (shape.type === "rectangle") {
    const corners = [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height },
    ];
    return corners.some(
      (corner, index) =>
        getDistanceToSegment(point, corner, corners[(index + 1) % 4]) <= reach
    );
  }
  // Near enough for an ellipse: how far out from its middle the point is,
  // compared with its edge there.
  const rx = box.width / 2;
  const ry = box.height / 2;
  const dx = point.x - box.x - rx;
  const dy = point.y - box.y - ry;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return Math.min(rx, ry) <= reach;
  }
  const edge = (rx * ry) / Math.hypot(ry * dx, rx * dy);
  return Math.abs(distance - edge * distance) <= reach;
}

/**
 * A shape once `handle` is dragged `dx` and `dy`. A rectangle or ellipse
 * resizes like any box, no smaller than `min`. A line or arrow moves the end
 * at that corner, which can swing past the other.
 */
export function resizeShape(
  shape: Shape,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  min: Size
): Shape {
  if (!isLine(shape)) {
    return { ...shape, ...resizeBox(shape, handle, dx, dy, min) };
  }
  // Which corner of its box it starts at.
  const startsWest = shape.width >= 0;
  const startsNorth = shape.height >= 0;
  const atStart =
    handle.endsWith(startsWest ? "w" : "e") &&
    handle.startsWith(startsNorth ? "n" : "s");
  return atStart
    ? {
        ...shape,
        x: shape.x + dx,
        y: shape.y + dy,
        width: shape.width - dx,
        height: shape.height - dy,
      }
    : { ...shape, width: shape.width + dx, height: shape.height + dy };
}

/** The corners a line or arrow's ends are at, e.g. "nw-se". */
export function getLineEnds(shape: Shape): "nw-se" | "ne-sw" {
  return shape.width >= 0 === shape.height >= 0 ? "nw-se" : "ne-sw";
}

/**
 * The shape dragged out from `start` to `end`, as the shape tool draws it.
 * `constrained`, e.g. with Shift held, makes a rectangle a square and an
 * ellipse a circle, and turns a line to the nearest eighth of a turn.
 */
export function dragShape(
  shape: Omit<Shape, "x" | "y" | "width" | "height">,
  start: Point,
  end: Point,
  constrained: boolean
): Shape {
  let width = end.x - start.x;
  let height = end.y - start.y;
  if (constrained && (shape.type === "line" || shape.type === "arrow")) {
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(height, width) / step) * step;
    const length = Math.hypot(width, height);
    width = round(Math.cos(angle) * length);
    height = round(Math.sin(angle) * length);
  } else if (constrained) {
    const side = Math.max(Math.abs(width), Math.abs(height));
    width = Math.sign(width || 1) * side;
    height = Math.sign(height || 1) * side;
  }
  const dragged = { ...shape, x: start.x, y: start.y, width, height };
  return shape.type === "line" || shape.type === "arrow"
    ? dragged
    : { ...dragged, ...getShapeBox(dragged) };
}
