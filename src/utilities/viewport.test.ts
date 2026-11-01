import { describe, expect, it } from "vitest";
import {
  clampZoom,
  fitViewport,
  getOpaqueBox,
  getStrokeBox,
  getVisibleArea,
  panBy,
  stepZoom,
  toDrawingPoint,
  unionBoxes,
  zoomAround,
} from "./viewport";

const VIEWPORT = { x: 100, y: 50, zoom: 2 };

describe("viewport", () => {
  it("finds where a point on screen is on the drawing", () => {
    expect(toDrawingPoint(VIEWPORT, { x: 40, y: 20 })).toEqual({
      x: 120,
      y: 60,
    });
  });

  it("zooms around a point, keeping the drawing under it in place", () => {
    const point = { x: 40, y: 20 };
    const zoomed = zoomAround(VIEWPORT, 4, point);

    expect(zoomed.zoom).toBe(4);
    expect(toDrawingPoint(zoomed, point)).toEqual(
      toDrawingPoint(VIEWPORT, point)
    );
  });

  it("keeps the zoom between its least and most", () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(50)).toBe(10);
    expect(zoomAround(VIEWPORT, 100, { x: 0, y: 0 }).zoom).toBe(10);
  });

  it("pans as if the drawing were dragged", () => {
    // Dragging 20 pixels right at 200% shows 10 units further left.
    expect(panBy(VIEWPORT, 20, -10)).toEqual({ x: 90, y: 55, zoom: 2 });
  });

  it("steps to the next zoom in or out", () => {
    expect(stepZoom(1, "in")).toBe(1.5);
    expect(stepZoom(1, "out")).toBe(0.75);
    // From between steps, to the nearest one that way.
    expect(stepZoom(1.2, "in")).toBe(1.5);
    expect(stepZoom(1.2, "out")).toBe(1);
    // It stops at the ends.
    expect(stepZoom(10, "in")).toBe(10);
  });

  it("shows less of the drawing zoomed in", () => {
    expect(getVisibleArea(VIEWPORT, { width: 800, height: 600 })).toEqual({
      x: 100,
      y: 50,
      width: 400,
      height: 300,
    });
  });

  it("finds the box around strokes, including their width", () => {
    const stroke = {
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 5 },
      ],
      size: 2,
    };

    expect(getStrokeBox(stroke)).toEqual({ x: 8, y: 3, width: 24, height: 19 });
    expect(
      unionBoxes([getStrokeBox(stroke)!, { x: 0, y: 0, width: 1, height: 1 }])
    ).toEqual({
      x: 0,
      y: 0,
      width: 32,
      height: 22,
    });
    expect(unionBoxes([])).toBeNull();
  });

  it("fits a box in the middle, with room around it", () => {
    const size = { width: 1000, height: 500 };
    // 200 by 100 units, which fits at 400% with a tenth of each side spare.
    const viewport = fitViewport({ x: 0, y: 0, width: 200, height: 100 }, size);

    expect(viewport.zoom).toBe(4);
    // The box's middle is the canvas's.
    expect(toDrawingPoint(viewport, { x: 500, y: 250 })).toEqual({
      x: 100,
      y: 50,
    });
  });

  it("goes back to 100% with nothing to fit", () => {
    expect(fitViewport(null, { width: 100, height: 100 })).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
  });

  it("finds the box around an image's opaque pixels", () => {
    // 4 by 3, with a faint pixel at the top left, which doesn't count.
    const data = new Uint8ClampedArray(4 * 3 * 4);
    data[3] = 5;
    data[(1 * 4 + 1) * 4 + 3] = 255;
    data[(2 * 4 + 2) * 4 + 3] = 100;

    expect(getOpaqueBox(data, 4, 3, 8)).toEqual({
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    });
    expect(getOpaqueBox(new Uint8ClampedArray(16), 2, 2, 8)).toBeNull();
  });
});
