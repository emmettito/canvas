import { describe, expect, it } from "vitest";
import {
  floodFill,
  growMask,
  type Mask,
  simplifyRing,
  touchesEdge,
  traceMask,
} from "./flood-fill";

// An image from rows of "#" for black pixels and "." for white ones.
function createImage(rows: string[]) {
  const width = rows[0].length;
  const height = rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    [...row].forEach((pixel, x) => {
      const value = pixel === "#" ? 0 : 255;
      data.set([value, value, value, 255], (y * width + x) * 4);
    });
  });
  return { data, width, height };
}

// The mask as rows, like an image's.
function toRows({ pixels, width, height }: Mask): string[] {
  return Array.from({ length: height }, (_, y) =>
    [...pixels.slice(y * width, (y + 1) * width)]
      .map((pixel) => (pixel ? "#" : "."))
      .join("")
  );
}

// A white square with a black outline, inside a white margin.
const BOX = [
  ".......",
  ".#####.",
  ".#...#.",
  ".#...#.",
  ".#...#.",
  ".#####.",
  ".......",
];

describe("floodFill", () => {
  it("fills what's inside an outline", () => {
    const { data, width, height } = createImage(BOX);

    const mask = floodFill(data, width, height, { x: 3, y: 3 }, 10);

    expect(toRows(mask)).toEqual([
      ".......",
      ".......",
      "..###..",
      "..###..",
      "..###..",
      ".......",
      ".......",
    ]);
    expect(touchesEdge(mask)).toBe(false);
  });

  it("fills around it from outside, to the edges", () => {
    const { data, width, height } = createImage(BOX);

    const mask = floodFill(data, width, height, { x: 0, y: 0 }, 10);

    expect(toRows(mask)[0]).toBe("#######");
    expect(toRows(mask)[3]).toBe("#.....#");
    expect(touchesEdge(mask)).toBe(true);
  });

  it("doesn't leak through corners that only touch", () => {
    const { data, width, height } = createImage([
      "...#",
      "..#.",
      ".#..",
      "#...",
    ]);

    const mask = floodFill(data, width, height, { x: 0, y: 0 }, 10);

    expect(toRows(mask)).toEqual(["###.", "##..", "#...", "...."]);
  });
});

describe("growMask", () => {
  it("grows the area a pixel each way", () => {
    const mask: Mask = {
      pixels: Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]),
      width: 3,
      height: 3,
    };

    expect(toRows(growMask(mask, 1))).toEqual([".#.", "###", ".#."]);
    expect(toRows(growMask(mask, 2))).toEqual(["###", "###", "###"]);
  });
});

describe("traceMask", () => {
  it("outlines a square by its corners", () => {
    const mask: Mask = {
      pixels: Uint8Array.from([0, 0, 0, 0, 1, 1, 0, 1, 1]),
      width: 3,
      height: 3,
    };

    const rings = traceMask(mask);

    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);
    expect(rings[0]).toEqual(
      expect.arrayContaining([
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
        { x: 1, y: 3 },
      ])
    );
  });

  it("gives a hole its own ring", () => {
    const { data, width, height } = createImage(BOX);
    // The outline itself, which has a hole in it.
    const mask = floodFill(data, width, height, { x: 1, y: 1 }, 10);

    expect(traceMask(mask)).toHaveLength(2);
  });
});

describe("simplifyRing", () => {
  it("turns steps into a slanted line", () => {
    // A staircase down from (0, 0) to (4, 4), and back along the edges.
    const ring = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];

    const simplified = simplifyRing(ring, 0.75);

    expect(simplified.length).toBeLessThan(ring.length);
    expect(simplified).toContainEqual({ x: 0, y: 4 });
  });
});
