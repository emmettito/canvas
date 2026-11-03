import { describe, expect, it } from "vitest";
import { type Fill } from "../models/fill.model";
import { type Stroke } from "../models/stroke.model";
import { eraseStroke, eraseStrokes, touchesFill } from "./erase-strokes";

const LINE: Stroke = {
  id: "l",
  color: "#000000",
  size: 2,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
};
const ACROSS: Stroke = {
  id: "e",
  size: 5,
  points: [
    { x: 50, y: -20 },
    { x: 50, y: 20 },
  ],
};

describe("eraseStroke", () => {
  it("leaves a stroke it doesn't touch as it is", () => {
    const far = { ...ACROSS, points: [{ x: 500, y: 500 }] };
    expect(eraseStroke(LINE, far)).toEqual([LINE]);
    expect(eraseStroke(LINE, far)[0]).toBe(LINE);
  });

  it("cuts a stroke it crosses in two, leaving nothing under it", () => {
    const pieces = eraseStroke(LINE, ACROSS);

    expect(pieces.map(({ id }) => id)).toEqual(["l.0", "l.1"]);
    expect(pieces.every(({ color }) => color === "#000000")).toBe(true);
    // Each piece's end reaches its size past its last point, to the eraser's
    // edge, which is 5 from its middle.
    const left = pieces[0].points.at(-1)!;
    const right = pieces[1].points[0];
    expect(left.x + LINE.size).toBeLessThanOrEqual(50 - 5);
    expect(left.x + LINE.size).toBeGreaterThan(50 - 5 - 2);
    expect(right.x - LINE.size).toBeGreaterThanOrEqual(50 + 5);
    expect(right.x - LINE.size).toBeLessThan(50 + 5 + 2);
  });

  it("keeps the id of the one piece left", () => {
    const end = { ...ACROSS, points: [{ x: 100, y: 0 }] };
    const pieces = eraseStroke(LINE, end);

    expect(pieces).toHaveLength(1);
    expect(pieces[0].id).toBe("l");
    expect(pieces[0].points.at(-1)!.x).toBeLessThan(100);
  });

  it("removes a stroke that's all under it", () => {
    const big = { ...ACROSS, size: 200, points: [{ x: 50, y: 0 }] };
    expect(eraseStroke(LINE, big)).toEqual([]);
  });

  it("removes a dot under it", () => {
    const dot = { ...LINE, points: [{ x: 50, y: 0 }] };
    expect(eraseStroke(dot, ACROSS)).toEqual([]);
  });

  it("gives pieces cut again ids of their own", () => {
    const [first] = eraseStroke(LINE, ACROSS);
    const again = { ...ACROSS, points: [{ x: 20, y: 0 }] };

    expect(eraseStroke(first, again).map(({ id }) => id)).toEqual([
      "l.0.0",
      "l.0.1",
    ]);
  });

  it("carries a pen's pressure to where it's cut", () => {
    const pen = {
      ...LINE,
      points: [
        { x: 0, y: 0, pressure: 0 },
        { x: 100, y: 0, pressure: 1 },
      ],
    };
    const [piece] = eraseStroke(pen, ACROSS);
    const end = piece.points.at(-1)!;

    expect(end.pressure).toBeCloseTo(end.x / 100);
  });

  it("reaches further for a square end's corners", () => {
    const round = { ...LINE, size: 20 };
    const square = { ...round, cap: "square" as const };
    const left = eraseStroke(square, ACROSS)[0].points.at(-1)!;
    const right = eraseStroke(round, ACROSS)[0].points.at(-1)!;

    expect(left.x).toBeLessThan(right.x);
  });
});

describe("eraseStrokes", () => {
  it("gives back the same strokes if it touched none", () => {
    const strokes = [LINE];
    const far = { ...ACROSS, points: [{ x: 500, y: 500 }] };
    expect(eraseStrokes(strokes, far)).toBe(strokes);
  });
});

describe("touchesFill", () => {
  const FILL: Fill = {
    color: "#ff0000",
    after: 0,
    rings: [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    ],
  };

  it("is whether it goes over any of them", () => {
    expect(touchesFill([FILL], { ...ACROSS, points: [{ x: 5, y: 5 }] })).toBe(
      true
    );
    expect(touchesFill([FILL], ACROSS)).toBe(false);
    expect(touchesFill([], ACROSS)).toBe(false);
  });
});
