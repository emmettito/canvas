import { describe, expect, it } from "vitest";
import { type Drawing } from "../models/drawing.model";
import { type Stroke } from "../models/stroke.model";
import { upgradeDrawing } from "./upgrade-drawing";

// As it was saved, with no ids.
const LINE = {
  color: "#000000",
  size: 2,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
} as Stroke;
const ERASER = { size: 5, points: [{ x: 50, y: 0 }] } as Stroke;
const FILL = {
  color: "#ff0000",
  rings: [
    [
      { x: 40, y: -10 },
      { x: 60, y: -10 },
      { x: 60, y: 10 },
    ],
  ],
};

function createOld(parts: Partial<Drawing>): Drawing {
  return {
    background: "#ffffff",
    strokes: [],
    fills: [],
    images: [],
    texts: [],
    notes: [],
    order: [],
    ...parts,
  } as unknown as Drawing;
}

describe("upgradeDrawing", () => {
  it("leaves one that's up to date as it is", () => {
    const drawing = createOld({ erasers: [] });
    expect(upgradeDrawing(drawing)).toBe(drawing);
  });

  it("gives strokes ids from where they were", () => {
    const { strokes } = upgradeDrawing(
      createOld({ strokes: [LINE], order: [{ kind: "strokes", count: 1 }] })
    );
    expect(strokes.map(({ id }) => id)).toEqual(["s0"]);
  });

  it("cuts what's before each eraser, and not what's after it", () => {
    const { strokes, erasers, order } = upgradeDrawing(
      createOld({
        strokes: [LINE, ERASER, LINE],
        order: [{ kind: "strokes", count: 3 }],
      })
    );

    expect(strokes.map(({ id }) => id)).toEqual(["s0.0", "s0.1", "s2"]);
    expect(erasers).toEqual([]);
    expect(order).toEqual([{ kind: "strokes", count: 3 }]);
  });

  it("keeps the run counts, either side of an item", () => {
    const { order } = upgradeDrawing(
      createOld({
        strokes: [LINE, LINE, ERASER],
        order: [
          { kind: "strokes", count: 1 },
          { kind: "images", id: "i" },
          { kind: "strokes", count: 2 },
        ],
      })
    );

    expect(order).toEqual([
      { kind: "strokes", count: 2 },
      { kind: "images", id: "i" },
      { kind: "strokes", count: 2 },
    ]);
  });

  it("keeps an eraser that erases a fill, which counts from those kept", () => {
    const { erasers, fills } = upgradeDrawing(
      createOld({
        strokes: [LINE, ERASER, LINE],
        // Filled after the first line, and after the eraser.
        fills: [
          { ...FILL, after: 1 },
          { ...FILL, after: 2 },
        ],
        order: [{ kind: "strokes", count: 3 }],
      })
    );

    expect(erasers.map(({ id }) => id)).toEqual(["s1"]);
    expect(fills.map(({ after }) => after)).toEqual([0, 1]);
  });

  it("doesn't keep one with only fills after it", () => {
    const { erasers } = upgradeDrawing(
      createOld({
        strokes: [ERASER],
        fills: [{ ...FILL, after: 1 }],
        order: [{ kind: "strokes", count: 1 }],
      })
    );
    expect(erasers).toEqual([]);
  });
});
