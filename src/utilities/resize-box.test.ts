import { describe, expect, it } from "vitest";
import { resizeBox, resizeBoxKeepingShape } from "./resize-box";

const BOX = { x: 100, y: 50, width: 80, height: 40 };
const MIN = { width: 20, height: 10 };

describe("resizeBox", () => {
  it("moves only the right side from the right", () => {
    expect(resizeBox(BOX, "e", 30, 99, MIN)).toEqual({ ...BOX, width: 110 });
  });

  it("keeps the right side in place from the left", () => {
    expect(resizeBox(BOX, "w", 30, 0, MIN)).toEqual({
      ...BOX,
      x: 130,
      width: 50,
    });
  });

  it("keeps the bottom in place from the top", () => {
    expect(resizeBox(BOX, "n", 99, -20, MIN)).toEqual({
      ...BOX,
      y: 30,
      height: 60,
    });
  });

  it("moves two sides from a corner, keeping the opposite corner", () => {
    expect(resizeBox(BOX, "nw", -10, 10, MIN)).toEqual({
      x: 90,
      y: 60,
      width: 90,
      height: 30,
    });
  });

  it("stops at the smallest size, without moving the opposite side", () => {
    expect(resizeBox(BOX, "nw", 500, 500, MIN)).toEqual({
      x: 160,
      y: 80,
      width: 20,
      height: 10,
    });
  });
});

describe("resizeBoxKeepingShape", () => {
  it("keeps the shape, following the longer drag", () => {
    // Half as wide again, which outweighs the small move down.
    expect(resizeBoxKeepingShape(BOX, "se", 40, 2, 16)).toEqual({
      ...BOX,
      width: 120,
      height: 60,
    });
  });

  it("keeps the opposite corner in place", () => {
    expect(resizeBoxKeepingShape(BOX, "nw", 0, -40, 16)).toEqual({
      x: 20,
      y: 10,
      width: 160,
      height: 80,
    });
  });

  it("doesn't let either side get smaller than the least", () => {
    expect(resizeBoxKeepingShape(BOX, "se", -500, 0, 16)).toEqual({
      ...BOX,
      width: 32,
      height: 16,
    });
  });
});
