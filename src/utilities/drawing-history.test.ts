import { describe, expect, it } from "vitest";
import { type Stroke } from "../models/stroke.model";
import { DrawingHistory } from "./drawing-history";

function createStroke(x: number): Stroke {
  return { color: "#000000", points: [{ x, y: 0 }], size: 1 };
}

describe("DrawingHistory", () => {
  it("starts empty", () => {
    const history = new DrawingHistory();

    expect(history.strokes).toEqual([]);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("undoes and redoes strokes in order", () => {
    const first = createStroke(1);
    const second = createStroke(2);
    const history = new DrawingHistory();

    history.addStroke(first);
    history.addStroke(second);
    history.undo();
    expect(history.strokes).toEqual([first]);
    expect(history.canRedo).toBe(true);

    history.undo();
    expect(history.strokes).toEqual([]);
    expect(history.canUndo).toBe(false);

    history.redo();
    expect(history.strokes).toEqual([first]);

    history.redo();
    expect(history.strokes).toEqual([first, second]);
    expect(history.canRedo).toBe(false);
  });

  it("clears redo when a new stroke is added", () => {
    const history = new DrawingHistory();

    history.addStroke(createStroke(1));
    history.undo();
    history.addStroke(createStroke(2));

    expect(history.canRedo).toBe(false);
  });

  it("ignores undo and redo when there is nothing to do", () => {
    const history = new DrawingHistory();
    const { strokes } = history;

    history.undo();
    history.redo();

    // The same array means the strokes weren't replaced.
    expect(history.strokes).toBe(strokes);
  });

  it("replaces the strokes array on each change", () => {
    const history = new DrawingHistory();
    const { strokes } = history;

    history.addStroke(createStroke(1));

    expect(strokes).toEqual([]);
  });
});
