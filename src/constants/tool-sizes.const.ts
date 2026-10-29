import { type StrokeTool } from "../models/tool.model";

// The sizes the pencil and eraser offer, smallest first, as the radius of
// what they draw, in screen pixels, so they look the same at any zoom.
export const TOOL_SIZES: Record<StrokeTool, number[]> = {
  pencil: [1, 2.5, 5, 10, 20],
  eraser: [5, 10, 20, 30, 40],
};
