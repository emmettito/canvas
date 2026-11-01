import { PEN_PRESSURE } from "../constants/pen-pressure.const";
import { type Point } from "../models/point.model";
import { type Stroke, type StrokePoint } from "../models/stroke.model";

/**
 * One piece of a stroke: a straight line, or a curve bending towards
 * `control`, drawn `size` wide either side of its middle.
 */
export interface StrokePiece {
  from: Point;
  control: Point | null;
  to: Point;
  size: number;
}

function middle(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Whether a pen drew it, so it's wider where it pressed harder. */
export function hasPressure({ points }: Stroke): boolean {
  return points.some(({ pressure }) => pressure !== undefined);
}

// How hard a pen pressed at a point, or halfway, the size drawn at, for a
// point without one.
function getPressure({ pressure }: StrokePoint): number {
  return pressure ?? 0.5;
}

// How wide a pen drew where it pressed `pressure`, as a multiple of the
// stroke's size.
function getPressureScale(pressure: number): number {
  return PEN_PRESSURE.min + (PEN_PRESSURE.max - PEN_PRESSURE.min) * pressure;
}

/** How far a stroke reaches from its points, at its widest. */
export function getStrokeReach(stroke: Stroke): number {
  return hasPressure(stroke) ? stroke.size * PEN_PRESSURE.max : stroke.size;
}

/** The radius a stroke's first point is drawn at, alone, as a dot. */
export function getDotSize(stroke: Stroke): number {
  const [point] = stroke.points;
  return hasPressure(stroke)
    ? stroke.size * getPressureScale(getPressure(point))
    : stroke.size;
}

/**
 * A stroke of two points or more as pieces, smoothed so it curves through
 * the middle of each pair of points rather than turning sharply at each.
 * Pieces are numbered from 1, each ending halfway to the point with its
 * number, and the last piece, numbered after them, goes on to the last
 * point. `from` leaves out the pieces before it, and `end` the last, e.g.
 * to draw only what a point just added adds, and draw the end once the
 * stroke's done, since a later point would curve it. A pen's pieces are
 * each as wide as it pressed halfway along them.
 */
export function getStrokePieces(
  stroke: Stroke,
  from = 1,
  end = true
): StrokePiece[] {
  const { points, size } = stroke;
  const count = points.length;
  // How hard a pen pressed at each point, and halfway to the one after.
  const pressed = hasPressure(stroke);
  const pressures = points.map(getPressure);
  const halfway = (index: number) =>
    (pressures[index] + pressures[index + 1]) / 2;
  const getSize = (start: number, finish: number) =>
    pressed ? size * getPressureScale((start + finish) / 2) : size;
  const pieces: StrokePiece[] = [];
  for (let index = Math.max(from, 1); index < count; index++) {
    const point = points[index];
    const before = points[index - 1];
    pieces.push(
      index === 1
        ? {
            from: before,
            control: null,
            to: middle(before, point),
            size: getSize(pressures[0], halfway(0)),
          }
        : {
            from: middle(points[index - 2], before),
            control: before,
            to: middle(before, point),
            size: getSize(halfway(index - 2), halfway(index - 1)),
          }
    );
  }
  if (end && count >= 2 && from <= count) {
    const last = points[count - 1];
    pieces.push({
      from: middle(points[count - 2], last),
      control: null,
      to: last,
      size: getSize(halfway(count - 2), pressures[count - 1]),
    });
  }
  return pieces;
}

// How far apart, at most, the points a curve's followed through are, so it
// still looks curved.
const CURVE_STEP = 2;

// Where a curve from `from`, bending towards `control`, is `t` of the way to
// `to`.
function along(from: Point, control: Point, to: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  };
}

// What an upright square `size` either side of its middle covers, moved
// straight from `a` to `b`: its corners at each end, joined along the way,
// always going around the same way.
function sweepSquare(a: Point, b: Point, size: number): Point[] {
  const x = (b.x < a.x ? -1 : 1) * size;
  const y = (b.y < a.y ? -1 : 1) * size;
  const outline = [
    { x: a.x - x, y: a.y - y },
    { x: a.x + x, y: a.y - y },
    { x: b.x + x, y: b.y - y },
    { x: b.x + x, y: b.y + y },
    { x: b.x - x, y: b.y + y },
    { x: a.x - x, y: a.y + y },
  ];
  return x * y < 0 ? outline.reverse() : outline;
}

/**
 * A square-ended stroke's pieces (see `getStrokePieces`) as outlines that,
 * filled together, cover what an upright square tip covers moved along
 * them, like a highlighter's, so it doesn't turn with each little wobble
 * the way a square line cap does. They all go around the same way, so where
 * they overlap is still filled.
 */
export function getSquareOutlines(
  stroke: Stroke,
  from = 1,
  end = true
): Point[][] {
  return getStrokePieces(stroke, from, end).flatMap(
    ({ from: start, control, to, size }) => {
      const steps = control
        ? Math.min(
            32,
            Math.max(
              1,
              Math.ceil(
                (Math.hypot(control.x - start.x, control.y - start.y) +
                  Math.hypot(to.x - control.x, to.y - control.y)) /
                  CURVE_STEP
              )
            )
          )
        : 1;
      const outlines: Point[][] = [];
      let before = start;
      for (let step = 1; step <= steps; step++) {
        const next =
          control && step < steps
            ? along(start, control, to, step / steps)
            : to;
        outlines.push(sweepSquare(before, next, size));
        before = next;
      }
      return outlines;
    }
  );
}
