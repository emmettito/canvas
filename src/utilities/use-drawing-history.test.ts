import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type Stroke } from "../models/stroke.model";
import { useDrawingHistory } from "./use-drawing-history";

function createStroke(x: number): Stroke {
  return { color: "#000000", points: [{ x, y: 0 }], size: 1 };
}

describe("useDrawingHistory", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useDrawingHistory());

    expect(result.current.strokes).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("undoes and redoes strokes in order", () => {
    const first = createStroke(1);
    const second = createStroke(2);
    const { result } = renderHook(() => useDrawingHistory());

    act(() => result.current.addStroke(first));
    act(() => result.current.addStroke(second));
    act(() => result.current.undo());
    expect(result.current.strokes).toEqual([first]);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.strokes).toEqual([]);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.redo());
    expect(result.current.strokes).toEqual([first]);

    act(() => result.current.redo());
    expect(result.current.strokes).toEqual([first, second]);
    expect(result.current.canRedo).toBe(false);
  });

  it("clears redo when a new stroke is added", () => {
    const { result } = renderHook(() => useDrawingHistory());

    act(() => result.current.addStroke(createStroke(1)));
    act(() => result.current.undo());
    act(() => result.current.addStroke(createStroke(2)));

    expect(result.current.canRedo).toBe(false);
  });

  it("ignores undo and redo when there is nothing to do", () => {
    const { result } = renderHook(() => useDrawingHistory());
    const { strokes } = result.current;

    act(() => result.current.undo());
    act(() => result.current.redo());

    // The same array means the history wasn't replaced.
    expect(result.current.strokes).toBe(strokes);
  });
});
