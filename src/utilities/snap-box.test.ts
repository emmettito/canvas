import { describe, expect, it } from "vitest";
import { snapBox } from "./snap-box";

const OTHER = { x: 100, y: 100, width: 160, height: 160 };
const SIZE = { width: 160, height: 160 };

describe("snapBox", () => {
  it("leaves a box that's nowhere near another", () => {
    const box = { x: 600, y: 700, ...SIZE };
    expect(snapBox(box, [OTHER], 6, 16)).toEqual({
      x: 600,
      y: 700,
      guides: [],
    });
  });

  it("lines up a box's sides with another's, below it", () => {
    const box = { x: 104, y: 400, ...SIZE };
    expect(snapBox(box, [OTHER], 6, 16)).toEqual({
      x: 100,
      y: 400,
      guides: [
        { from: { x: 100, y: 100 }, to: { x: 100, y: 560 } },
        { from: { x: 260, y: 100 }, to: { x: 260, y: 560 } },
      ],
    });
  });

  it("lines up the middles of boxes of different sizes", () => {
    const box = { x: 400, y: 158, width: 80, height: 40 };
    const { y } = snapBox(box, [OTHER], 6, 16);
    // The other's middle is at 180, so this one's top is 20 above it.
    expect(y).toBe(160);
  });

  it("puts a box the gap beside one it's level with", () => {
    const box = { x: 280, y: 100, ...SIZE };
    expect(snapBox(box, [OTHER], 6, 16)).toEqual({
      x: 276,
      y: 100,
      // Across the gap, halfway down, and along the shared top and bottom.
      guides: [
        { from: { x: 260, y: 180 }, to: { x: 276, y: 180 } },
        { from: { x: 100, y: 100 }, to: { x: 436, y: 100 } },
        { from: { x: 100, y: 260 }, to: { x: 436, y: 260 } },
      ],
    });
  });

  it("doesn't put a box the gap beside one it isn't level with", () => {
    const box = { x: 280, y: 500, ...SIZE };
    expect(snapBox(box, [OTHER], 6, 16).x).toBe(280);
  });

  it("snaps each axis to whichever box is closest", () => {
    const above = { x: 400, y: 0, ...SIZE };
    const box = { x: 397, y: 102, ...SIZE };
    const { x, y } = snapBox(box, [OTHER, above], 6, 16);
    expect(x).toBe(400);
    expect(y).toBe(100);
  });

  it("shows a guide to each box lined up the same way", () => {
    const below = { x: 100, y: 600, ...SIZE };
    const box = { x: 103, y: 350, ...SIZE };
    const { guides } = snapBox(box, [OTHER, below], 6, 16);
    // Along both sides of each.
    expect(guides).toHaveLength(4);
  });
});
