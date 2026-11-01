import { type Box } from "../models/box.model";
import { type Point } from "../models/point.model";

type Axis = "x" | "y";

// A line showing what a box snapped to, from `from` to `to`, in drawing
// units.
export interface SnapGuide {
  from: Point;
  to: Point;
}

export interface Snapped {
  // Where the box's top left corner goes.
  x: number;
  y: number;
  guides: SnapGuide[];
}

// A way the box could line up with another along one axis: moving it `delta`
// puts one of its edges, or its middle, at `at` on the other's.
interface Match {
  delta: number;
  other: Box;
  // An edge or the middle lined up with the other's, or `gap` beside it.
  kind: "edge" | "middle" | "gap";
  at: number;
}

const ACROSS: Record<Axis, Axis> = { x: "y", y: "x" };

function start(box: Box, axis: Axis): number {
  return axis === "x" ? box.x : box.y;
}

function length(box: Box, axis: Axis): number {
  return axis === "x" ? box.width : box.height;
}

function end(box: Box, axis: Axis): number {
  return start(box, axis) + length(box, axis);
}

function middle(box: Box, axis: Axis): number {
  return start(box, axis) + length(box, axis) / 2;
}

function overlaps(a: Box, b: Box, axis: Axis): boolean {
  return start(a, axis) < end(b, axis) && start(b, axis) < end(a, axis);
}

function moveBy(box: Box, axis: Axis, delta: number): Box {
  return axis === "x"
    ? { ...box, x: box.x + delta }
    : { ...box, y: box.y + delta };
}

// Every way `box` lines up with `others` along `axis`: an edge with an edge,
// the middle with the middle, or `gap` beside one it's level with.
function findMatches(
  box: Box,
  others: Box[],
  axis: Axis,
  gap: number
): Match[] {
  const edges = [start(box, axis), end(box, axis)];
  const matches: Match[] = [];
  for (const other of others) {
    for (const at of [start(other, axis), end(other, axis)]) {
      for (const edge of edges) {
        matches.push({ delta: at - edge, other, kind: "edge", at });
      }
    }
    const at = middle(other, axis);
    matches.push({ delta: at - middle(box, axis), other, kind: "middle", at });
    if (overlaps(box, other, ACROSS[axis])) {
      const before = start(other, axis) - gap;
      const after = end(other, axis) + gap;
      matches.push(
        { delta: before - end(box, axis), other, kind: "gap", at: before },
        { delta: after - start(box, axis), other, kind: "gap", at: after }
      );
    }
  }
  return matches;
}

// The matches that move the box least, if that's no more than `distance`.
// Others lined up the same way are kept too, so each gets a guide, except a
// middle lined up with one whose edges are too, e.g. two notes the same size.
function closest(matches: Match[], distance: number): Match[] {
  let best: number | null = null;
  for (const { delta } of matches) {
    if (
      Math.abs(delta) <= distance &&
      (best === null || Math.abs(delta) < Math.abs(best))
    ) {
      best = delta;
    }
  }
  if (best === null) {
    return [];
  }
  const kept = matches.filter(({ delta }) => Math.abs(delta - best) < 1e-6);
  return kept.filter(
    (match) =>
      match.kind !== "middle" ||
      !kept.some(({ other, kind }) => other === match.other && kind === "edge")
  );
}

// The point `value` along `axis` and `across` along the other.
function toPoint(axis: Axis, value: number, across: number): Point {
  return axis === "x" ? { x: value, y: across } : { x: across, y: value };
}

// Lined up, a line along the shared edge or middle, past both boxes. Beside
// one, a line across the gap, halfway along where they're level.
function toGuide(box: Box, { other, kind, at }: Match, axis: Axis): SnapGuide {
  const across = ACROSS[axis];
  if (kind === "gap") {
    const [first, second] =
      start(box, axis) < start(other, axis) ? [box, other] : [other, box];
    const level =
      (Math.max(start(box, across), start(other, across)) +
        Math.min(end(box, across), end(other, across))) /
      2;
    return {
      from: toPoint(axis, end(first, axis), level),
      to: toPoint(axis, start(second, axis), level),
    };
  }
  return {
    from: toPoint(axis, at, Math.min(start(box, across), start(other, across))),
    to: toPoint(axis, at, Math.max(end(box, across), end(other, across))),
  };
}

/**
 * Where `box` goes once it's snapped to `others`, if it's within `distance`
 * of lining up with one: an edge with an edge, its middle with the middle,
 * or `gap` beside one it's level with. Each axis snaps on its own, to
 * whichever match is closest, and each match gets a guide.
 */
export function snapBox(
  box: Box,
  others: Box[],
  distance: number,
  gap: number
): Snapped {
  const x = closest(findMatches(box, others, "x", gap), distance);
  const y = closest(findMatches(box, others, "y", gap), distance);
  let snapped = box;
  if (x.length > 0) {
    snapped = moveBy(snapped, "x", x[0].delta);
  }
  if (y.length > 0) {
    snapped = moveBy(snapped, "y", y[0].delta);
  }
  return {
    x: snapped.x,
    y: snapped.y,
    guides: [
      ...x.map((match) => toGuide(snapped, match, "x")),
      ...y.map((match) => toGuide(snapped, match, "y")),
    ],
  };
}
