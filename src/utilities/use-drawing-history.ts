import { useCallback, useState } from "react";
import { Stroke } from "../models/stroke.model";

interface DrawingHistory {
  strokes: Stroke[];
  undone: Stroke[];
}

export function useDrawingHistory() {
  const [{ strokes, undone }, setHistory] = useState<DrawingHistory>({
    strokes: [],
    undone: [],
  });

  const addStroke = useCallback((stroke: Stroke) => {
    // A new stroke invalidates anything that could have been redone.
    setHistory(({ strokes }) => ({ strokes: [...strokes, stroke], undone: [] }));
  }, []);

  const undo = useCallback(() => {
    setHistory((history) =>
      history.strokes.length === 0
        ? history
        : {
            strokes: history.strokes.slice(0, -1),
            undone: [history.strokes[history.strokes.length - 1], ...history.undone],
          }
    );
  }, []);

  const redo = useCallback(() => {
    setHistory((history) =>
      history.undone.length === 0
        ? history
        : {
            strokes: [...history.strokes, history.undone[0]],
            undone: history.undone.slice(1),
          }
    );
  }, []);

  return {
    strokes,
    addStroke,
    undo,
    redo,
    canUndo: strokes.length > 0,
    canRedo: undone.length > 0,
  };
}
