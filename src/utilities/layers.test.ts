import { describe, expect, it } from "vitest";
import { type Drawing } from "../models/drawing.model";
import { type Stroke } from "../models/stroke.model";
import {
  getDefaultOrder,
  isAtEdge,
  isOrderOf,
  resolveLayers,
  restackItemLayer,
} from "./layers";

const pencil: Stroke = { color: "#000000", points: [{ x: 0, y: 0 }], size: 1 };
const eraser: Stroke = { points: [{ x: 0, y: 0 }], size: 1 };
const image = { id: "i", x: 0, y: 0, width: 10, height: 10 };

function createDrawing(parts: Partial<Drawing>): Drawing {
  return {
    background: "#ffffff",
    strokes: [],
    images: [],
    texts: [],
    notes: [],
    order: [],
    ...parts,
  };
}

describe("getDefaultOrder", () => {
  it("puts every stroke below the items, as before there was an order", () => {
    expect(
      getDefaultOrder(
        createDrawing({ strokes: [pencil, pencil], images: [image] })
      )
    ).toEqual([
      { kind: "strokes", count: 2 },
      { kind: "images", id: "i" },
    ]);
  });

  it("has no run of strokes without strokes", () => {
    expect(getDefaultOrder(createDrawing({ images: [image] }))).toEqual([
      { kind: "images", id: "i" },
    ]);
  });
});

describe("isOrderOf", () => {
  const drawing = createDrawing({ strokes: [pencil], images: [image] });

  it("accepts an order of exactly what's drawn", () => {
    expect(
      isOrderOf(
        [
          { kind: "images", id: "i" },
          { kind: "strokes", count: 1 },
        ],
        drawing
      )
    ).toBe(true);
  });

  it("rejects one missing, repeating or adding something", () => {
    expect(isOrderOf([{ kind: "strokes", count: 1 }], drawing)).toBe(false);
    expect(
      isOrderOf(
        [
          { kind: "strokes", count: 2 },
          { kind: "images", id: "i" },
        ],
        drawing
      )
    ).toBe(false);
    expect(
      isOrderOf(
        [
          { kind: "strokes", count: 1 },
          { kind: "images", id: "i" },
          { kind: "images", id: "i" },
        ],
        drawing
      )
    ).toBe(false);
  });
});

describe("restackItemLayer", () => {
  it("leaves an item already at the front as it is", () => {
    const order = [
      { kind: "strokes", count: 1 },
      { kind: "images", id: "i" },
    ] as const;

    expect(restackItemLayer([...order], "images", "i", "front")).toEqual(order);
    expect(isAtEdge([...order], "images", "i", "front")).toBe(true);
    expect(isAtEdge([...order], "images", "i", "back")).toBe(false);
  });
});

describe("resolveLayers", () => {
  it("gives each run its strokes, and the erasers above it", () => {
    const drawing = createDrawing({
      strokes: [pencil, eraser, pencil, eraser],
      images: [image],
      order: [
        { kind: "strokes", count: 2 },
        { kind: "images", id: "i" },
        { kind: "strokes", count: 2 },
      ],
    });

    expect(resolveLayers(drawing)).toEqual([
      { kind: "strokes", start: 0, strokes: [pencil, eraser], erasedBy: [3] },
      { kind: "images", item: image },
      { kind: "strokes", start: 2, strokes: [pencil, eraser], erasedBy: [] },
    ]);
  });
});
