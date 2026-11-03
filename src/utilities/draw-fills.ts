import { type Fill } from "../models/fill.model";
import { type Stroke } from "../models/stroke.model";
import { drawStroke } from "./draw-stroke";

/** A fill's outlines, as one shape, filled every other time they cross. */
export function getFillPath({ rings }: Fill): Path2D {
  const path = new Path2D();
  for (const ring of rings) {
    ring.forEach(({ x, y }, index) => {
      if (index === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    });
    path.closePath();
  }
  return path;
}

/**
 * The order fills are drawn and erased in: each fill, then each eraser
 * drawn after it, so an eraser only erases fills before it. `erasers` are
 * what fills count from.
 */
export function getFillSteps(
  fills: Fill[],
  erasers: Stroke[]
): ({ fill: Fill } | { eraser: Stroke; index: number })[] {
  const steps: ({ fill: Fill } | { eraser: Stroke; index: number })[] = [];
  let next = 0;
  for (let index = 0; index <= erasers.length; index++) {
    while (next < fills.length && fills[next].after <= index) {
      steps.push({ fill: fills[next++] });
    }
    const eraser = erasers[index];
    // An eraser before any fill has nothing to erase.
    if (eraser && next > 0) {
      steps.push({ eraser, index });
    }
  }
  // Fills counted from more erasers than there are, e.g. once they're
  // removed, are drawn too.
  for (const fill of fills.slice(next)) {
    steps.push({ fill });
  }
  return steps;
}

/**
 * Draws fills onto a canvas that has only them, so erasing them erases
 * nothing else.
 */
export function drawFills(
  context: CanvasRenderingContext2D,
  fills: Fill[],
  erasers: Stroke[]
): void {
  for (const step of getFillSteps(fills, erasers)) {
    if ("eraser" in step) {
      drawStroke(context, step.eraser);
    } else {
      context.globalCompositeOperation = "source-over";
      context.fillStyle = step.fill.color;
      context.fill(getFillPath(step.fill), "evenodd");
    }
  }
}
