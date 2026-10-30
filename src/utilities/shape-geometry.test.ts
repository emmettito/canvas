import { describe, expect, it } from "vitest";
import { type Shape } from "../models/shape.model";
import {
  dragShape,
  getLineEnds,
  getShapeBox,
  getShapePath,
  hitsShape,
  isInsideShape,
  resizeShape,
} from "./shape-geometry";

const RECTANGLE: Shape = {
  id: "r",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  color: "#000000",
  strokeWidth: 4,
  fill: null,
};

const LINE: Shape = { ...RECTANGLE, id: "l", type: "line", width: 100 };

const MIN = { width: 4, height: 4 };

describe("getShapePath", () => {
  it("goes round a rectangle's corners", () => {
    expect(getShapePath(RECTANGLE)).toBe("M10 20L110 20L110 70L10 70Z");
  });

  it("draws from an origin, e.g. its element's corner", () => {
    expect(getShapePath(RECTANGLE, { x: 10, y: 20 })).toBe(
      "M0 0L100 0L100 50L0 50Z"
    );
  });

  it("draws an ellipse as two halves", () => {
    expect(getShapePath({ ...RECTANGLE, type: "ellipse" })).toBe(
      "M10 45A50 25 0 1 0 110 45A50 25 0 1 0 10 45Z"
    );
  });

  it("draws an arrow's head at its end, either side of the line", () => {
    const path = getShapePath({
      ...LINE,
      type: "arrow",
      width: 100,
      height: 0,
    });

    expect(path.startsWith("M10 20L110 20M")).toBe(true);
    const [, left, right] = path.match(
      /M([\d.]+ [\d.]+)L110 20L([\d.]+ [\d.]+)$/
    )!;
    const [leftX, leftY] = left.split(" ").map(Number);
    const [rightX, rightY] = right.split(" ").map(Number);
    expect(leftX).toBeLessThan(110);
    expect(leftX).toBeCloseTo(rightX);
    expect(leftY - 20).toBeCloseTo(-(rightY - 20));
  });
});

describe("isInsideShape", () => {
  it("is inside a rectangle's box", () => {
    expect(isInsideShape(RECTANGLE, { x: 60, y: 40 })).toBe(true);
    expect(isInsideShape(RECTANGLE, { x: 5, y: 40 })).toBe(false);
  });

  it("is inside an ellipse, not its box's corners", () => {
    const ellipse: Shape = { ...RECTANGLE, type: "ellipse" };

    expect(isInsideShape(ellipse, { x: 60, y: 45 })).toBe(true);
    expect(isInsideShape(ellipse, { x: 12, y: 22 })).toBe(false);
  });

  it("is never inside a line", () => {
    expect(isInsideShape(LINE, { x: 60, y: 45 })).toBe(false);
  });
});

describe("hitsShape", () => {
  it("presses an empty shape on its outline, not its middle", () => {
    expect(hitsShape(RECTANGLE, { x: 60, y: 21 }, 2)).toBe(true);
    expect(hitsShape(RECTANGLE, { x: 60, y: 45 }, 2)).toBe(false);
  });

  it("presses a filled shape anywhere inside", () => {
    expect(
      hitsShape({ ...RECTANGLE, fill: "#ff0000" }, { x: 60, y: 45 }, 2)
    ).toBe(true);
  });

  it("presses near an ellipse's edge", () => {
    const ellipse: Shape = { ...RECTANGLE, type: "ellipse" };

    expect(hitsShape(ellipse, { x: 11, y: 45 }, 2)).toBe(true);
    expect(hitsShape(ellipse, { x: 60, y: 45 }, 2)).toBe(false);
  });

  it("presses near a line, but not past its ends", () => {
    expect(hitsShape(LINE, { x: 60, y: 47 }, 2)).toBe(true);
    expect(hitsShape(LINE, { x: 60, y: 60 }, 2)).toBe(false);
    expect(hitsShape(LINE, { x: 130, y: 90 }, 2)).toBe(false);
  });
});

describe("resizeShape", () => {
  it("resizes a rectangle like a box", () => {
    expect(resizeShape(RECTANGLE, "se", 10, -10, MIN)).toMatchObject({
      x: 10,
      y: 20,
      width: 110,
      height: 40,
    });
  });

  it("moves the end of a line at the corner dragged", () => {
    expect(resizeShape(LINE, "se", 5, 5, MIN)).toMatchObject({
      x: 10,
      y: 20,
      width: 105,
      height: 55,
    });
    expect(resizeShape(LINE, "nw", 5, 5, MIN)).toMatchObject({
      x: 15,
      y: 25,
      width: 95,
      height: 45,
    });
  });

  it("swings a line's end past its start", () => {
    expect(resizeShape(LINE, "se", -150, 0, MIN)).toMatchObject({
      x: 10,
      width: -50,
    });
  });
});

describe("getLineEnds", () => {
  it("names the corners a line's ends are at", () => {
    expect(getLineEnds(LINE)).toBe("nw-se");
    expect(getLineEnds({ ...LINE, width: -100 })).toBe("ne-sw");
  });
});

describe("dragShape", () => {
  const { x: _, y: __, width: ___, height: ____, ...style } = RECTANGLE;

  it("fills the box dragged out, whichever way", () => {
    expect(
      getShapeBox(dragShape(style, { x: 50, y: 50 }, { x: 10, y: 30 }, false))
    ).toEqual({ x: 10, y: 30, width: 40, height: 20 });
    expect(
      dragShape(style, { x: 50, y: 50 }, { x: 10, y: 30 }, false)
    ).toMatchObject({ x: 10, y: 30, width: 40, height: 20 });
  });

  it("makes a square when constrained", () => {
    expect(
      dragShape(style, { x: 0, y: 0 }, { x: -30, y: 10 }, true)
    ).toMatchObject({ x: -30, y: 0, width: 30, height: 30 });
  });

  it("keeps a line's direction", () => {
    expect(
      dragShape(
        { ...style, type: "line" },
        { x: 50, y: 50 },
        { x: 10, y: 30 },
        false
      )
    ).toMatchObject({ x: 50, y: 50, width: -40, height: -20 });
  });

  it("turns a constrained line to the nearest eighth of a turn", () => {
    const line = dragShape(
      { ...style, type: "line" },
      { x: 0, y: 0 },
      { x: 100, y: 10 },
      true
    );

    expect(line.height).toBe(0);
    expect(line.width).toBeCloseTo(Math.hypot(100, 10));
  });
});
