import { describe, expect, it, vi } from "vitest";
import { type Stroke } from "../models/stroke.model";
import { drawStroke } from "./draw-stroke";

function createContext() {
  const widths: number[] = [];
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    globalAlpha: 1,
    stroke: vi.fn(() => widths.push(context.lineWidth as number)),
  } as unknown as CanvasRenderingContext2D & { lineWidth: number };
  return { context, widths };
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
    const { context } = createContext();

    drawStroke(context, { ...LINE, points: [{ x: 3, y: 4 }] });

    expect(context.arc).toHaveBeenCalledWith(3, 4, 4, 0, Math.PI * 2);
    expect(context.fill).toHaveBeenCalled();
    expect(context.stroke).not.toHaveBeenCalled();
  });

  it("curves through the middle of each pair of points, as one line", () => {
    const { context } = createContext();

    drawStroke(context, LINE);

    expect(context.moveTo).toHaveBeenCalledWith(0, 0);
    expect(context.lineTo).toHaveBeenNthCalledWith(1, 5, 0);
    expect(context.quadraticCurveTo).toHaveBeenCalledWith(10, 0, 15, 2.5);
    expect(context.lineTo).toHaveBeenNthCalledWith(2, 20, 5);
    expect(context.stroke).toHaveBeenCalledTimes(1);
    expect(context.lineWidth).toBe(8);
    expect(context.strokeStyle).toBe("#ff0000");
    expect(context.globalCompositeOperation).toBe("source-over");
  });

  it("draws only the pieces asked for, leaving the end until it's done", () => {
    const { context } = createContext();

    drawStroke(context, LINE, { from: 2, end: false });

    expect(context.moveTo).toHaveBeenCalledWith(5, 0);
    expect(context.quadraticCurveTo).toHaveBeenCalledWith(10, 0, 15, 2.5);
    expect(context.lineTo).not.toHaveBeenCalled();
  });

  it("draws just the end once it's done", () => {
    const { context } = createContext();

    drawStroke(context, LINE, { from: 3 });

    expect(context.moveTo).toHaveBeenCalledWith(15, 2.5);
    expect(context.lineTo).toHaveBeenCalledWith(20, 5);
    expect(context.quadraticCurveTo).not.toHaveBeenCalled();
  });

  it("draws a pen's pieces wider where it pressed harder", () => {
    const { context, widths } = createContext();

    drawStroke(context, {
      ...LINE,
      points: [
        { x: 0, y: 0, pressure: 0 },
        { x: 10, y: 0, pressure: 0.5 },
        { x: 20, y: 5, pressure: 1 },
      ],
    });

    expect(widths).toHaveLength(3);
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[2]);
  });

  it("draws a pen's dot as big as it pressed", () => {
    const { context } = createContext();

    drawStroke(context, { ...LINE, points: [{ x: 3, y: 4, pressure: 1 }] });

    expect(context.arc).toHaveBeenCalledWith(3, 4, 7, 0, Math.PI * 2);
  });

  it("draws a see-through stroke as see-through, then puts the context back", () => {
    const { context } = createContext();
    let alpha = 0;
    vi.mocked(context.stroke).mockImplementation(() => {
      alpha = context.globalAlpha;
    });

    drawStroke(context, { ...LINE, opacity: 0.4 });

    expect(alpha).toBe(0.4);
    expect(context.save).toHaveBeenCalled();
    expect(context.restore).toHaveBeenCalled();
  });

  it("erases when the stroke has no color", () => {
    const { context } = createContext();

    drawStroke(context, { ...LINE, color: undefined });

    expect(context.globalCompositeOperation).toBe("destination-out");
  });

  it("draws nothing without points", () => {
    const { context } = createContext();

    drawStroke(context, { ...LINE, points: [] });

    expect(context.beginPath).not.toHaveBeenCalled();
  });
});
