import { describe, expect, it } from "vitest";
import { type Stroke } from "../models/stroke.model";
import {
  isStrokeAt,
  isStrokeInBox,
  moveStroke,
  resizeStroke,
} from "./stroke-shape";

const LINE: Stroke = {
  id: "l",
  color: "#000000",
  size: 2,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
};

describe("isStrokeAt", () => {
  it("is on its line, as wide as it's drawn, and no further", () => {
    expect(isStrokeAt(LINE, { x: 50, y: 1 })).toBe(true);
    expect(isStrokeAt(LINE, { x: 50, y: 3 })).toBe(false);
    expect(isStrokeAt(LINE, { x: 50, y: 3 }, 2)).toBe(true);
  });
});

describe("isStrokeInBox", () => {
  it("is touched by a box a line only crosses, with no point inside", () => {
    const box = { x: 40, y: -10, width: 20, height: 20 };
    expect(isStrokeInBox(LINE, box)).toBe(true);
  });

  it("isn't touched by a box next to it", () => {
    const box = { x: 40, y: 10, width: 20, height: 20 };
    expect(isStrokeInBox(LINE, box)).toBe(false);
  });
});

describe("moveStroke", () => {
  it("moves every point, keeping its pressure", () => {
    const stroke = { ...LINE, points: [{ x: 1, y: 2, pressure: 0.5 }] };
    expect(moveStroke(stroke, 10, 20).points).toEqual([
      { x: 11, y: 22, pressure: 0.5 },
    ]);
  });
});

describe("resizeStroke", () => {
  it("stretches it from one box to another, with its width", () => {
    const from = { x: 0, y: 0, width: 100, height: 50 };
    const to = { x: 10, y: 10, width: 200, height: 100 };
    const resized = resizeStroke(LINE, from, to);

    expect(resized.points).toEqual([
      { x: 10, y: 10 },
      { x: 210, y: 10 },
    ]);
    expect(resized.size).toBe(4);
  });
});
