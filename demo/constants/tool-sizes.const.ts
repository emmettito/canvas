import { type StrokeTool } from "@emmettito/canvas";

// The sizes each stroke tool offers, thin, medium and thick, as the radius of
// what it draws, in screen pixels, so they look the same at any zoom. The
// highlighter and eraser cover more than the pencil draws.
export const TOOL_SIZES: Record<StrokeTool, number[]> = {
  pencil: [1, 2.5, 5],
  highlighter: [5, 10, 20],
  eraser: [5, 10, 20],
};

// What each of a tool's sizes is called, in the same order.
export const TOOL_SIZE_LABELS = ["Thin", "Medium", "Thick"];
