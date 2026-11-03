import { type Fill } from "../models/fill.model";
import { type Point } from "../models/point.model";
import { type Stroke, type StrokePoint } from "../models/stroke.model";
import { getPointReach, getStrokeReach } from "./stroke-pieces";
import { getFillBox, getStrokeBox, intersectBoxes } from "./viewport";

// How far apart, at most, the places along a stroke are that are checked
// against an eraser, in drawing units.
const ERASE_STEP = 1;

/** How far a point is from a line between two others. */
export function getDistanceToLine(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)
        );
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** How far a point is from the middle of a stroke. */
export function getDistanceToStroke(point: Point, { points }: Stroke): number {
  if (points.length === 1) {
    return Math.hypot(point.x - points[0].x, point.y - points[0].y);
  }
  let nearest = Infinity;
  for (let index = 1; index < points.length; index++) {
    nearest = Math.min(
      nearest,
      getDistanceToLine(point, points[index - 1], points[index])
    );
  }
  return nearest;
}

function interpolate(a: StrokePoint, b: StrokePoint, t: number): StrokePoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    ...(a.pressure !== undefined &&
      b.pressure !== undefined && {
        pressure: a.pressure + (b.pressure - a.pressure) * t,
      }),
  };
}

/**
 * What's left of `stroke` once `eraser` is drawn: the same stroke if it's
 * untouched, or else the pieces either side of where it was. A stroke's end
 * reaches past its last point, so a piece stops short enough to leave nothing
 * under the eraser. One piece left keeps its id, so it stays picked. Several
 * get ids from it, the same for everyone drawing together.
 */
export function eraseStroke(stroke: Stroke, eraser: Stroke): Stroke[] {
  const box = getStrokeBox(stroke);
  const eraserBox = getStrokeBox(eraser);
  if (
    !box ||
    !eraserBox ||
    !intersectBoxes(box, eraserBox) ||
    stroke.points.length === 0
  ) {
    return [stroke];
  }
  const eraserReach = getStrokeReach(eraser);
  const isErased = (point: StrokePoint) =>
    getDistanceToStroke(point, eraser) <=
    eraserReach + getPointReach(stroke, point);

  const { points } = stroke;
  if (points.length === 1) {
    return isErased(points[0]) ? [] : [stroke];
  }
  const pieces: StrokePoint[][] = [];
  let piece: StrokePoint[] | null = isErased(points[0]) ? null : [points[0]];
  let touched = piece === null;
  for (let index = 1; index < points.length; index++) {
    const before = points[index - 1];
    const point = points[index];
    const distance = Math.hypot(point.x - before.x, point.y - before.y);
    const steps = Math.max(1, Math.ceil(distance / ERASE_STEP));
    let previous = before;
    for (let step = 1; step <= steps; step++) {
      const at =
        step === steps ? point : interpolate(before, point, step / steps);
      const erased = isErased(at);
      if (erased && piece) {
        // As far as it goes, which may be between its points.
        if (piece.at(-1) !== previous) {
          piece.push(previous);
        }
        touched = true;
        pieces.push(piece);
        piece = null;
      } else if (!erased && !piece) {
        piece = [at];
      } else if (!erased && piece && step === steps) {
        piece.push(at);
      }
      previous = at;
    }
  }
  if (piece) {
    pieces.push(piece);
  }
  if (!touched) {
    return [stroke];
  }
  // A place left between two erased, too small to see, isn't a piece.
  const kept = pieces.filter(
    (each) => each.length > 1 || getPointReach(stroke, each[0]) > 0
  );
  return kept.length === 1
    ? [{ ...stroke, points: kept[0] }]
    : kept.map((each, index) => ({
        ...stroke,
        id: `${stroke.id}.${index}`,
        points: each,
      }));
}

/** `strokes` once `eraser` is drawn, or the same ones if it touched none. */
export function eraseStrokes(strokes: Stroke[], eraser: Stroke): Stroke[] {
  const erased = strokes.flatMap((stroke) => eraseStroke(stroke, eraser));
  return erased.length === strokes.length &&
    erased.every((stroke, index) => stroke === strokes[index])
    ? strokes
    : erased;
}

/**
 * Whether an eraser touches any of `fills`. Fills are outlines, rather than
 * lines to cut, so an eraser that does is kept, to draw over them.
 */
export function touchesFill(fills: Fill[], eraser: Stroke): boolean {
  const box = getStrokeBox(eraser);
  return (
    box !== null &&
    fills.some((fill) => {
      const fillBox = getFillBox(fill);
      return fillBox !== null && intersectBoxes(box, fillBox) !== null;
    })
  );
}
