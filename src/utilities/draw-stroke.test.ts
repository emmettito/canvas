import { describe, expect, it, vi } from "vitest";
import { type Stroke } from "../models/stroke.model";
import { drawStroke } from "./draw-stroke";

function createContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

const LINE: Stroke = {
  color: "#ff0000",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 5 },
  ],
  size: 4,
};

describe("drawStroke", () => {
  it("draws a single point as a dot", () => {
    const context = createContext();

    drawStroke(context, { ...LINE, points: [{ x: 3, y: 4 }] });

    expect(context.arc).toHaveBeenCalledWith(3, 4, 4, 0, Math.PI * 2);
    expect(context.fill).toHaveBeenCalled();
    expect(context.stroke).not.toHaveBeenCalled();
  });

  it("draws a line through every point", () => {
    const context = createContext();

    drawStroke(context, LINE);

    expect(context.moveTo).toHaveBeenCalledWith(0, 0);
    expect(context.lineTo).toHaveBeenNthCalledWith(1, 10, 0);
    expect(context.lineTo).toHaveBeenNthCalledWith(2, 20, 5);
    expect(context.lineWidth).toBe(8);
    expect(context.strokeStyle).toBe("#ff0000");
    expect(context.globalCompositeOperation).toBe("source-over");
  });

  it("draws only the segments after the start index", () => {
    const context = createContext();

    drawStroke(context, LINE, 1);

    expect(context.moveTo).toHaveBeenCalledWith(10, 0);
    expect(context.lineTo).toHaveBeenCalledTimes(1);
    expect(context.lineTo).toHaveBeenCalledWith(20, 5);
  });

  it("erases when the stroke has no color", () => {
    const context = createContext();

    drawStroke(context, { ...LINE, color: undefined });

    expect(context.globalCompositeOperation).toBe("destination-out");
  });

  it("draws nothing without points", () => {
    const context = createContext();

    drawStroke(context, { ...LINE, points: [] });

    expect(context.beginPath).not.toHaveBeenCalled();
  });
});
