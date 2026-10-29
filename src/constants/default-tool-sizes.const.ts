import { type StrokeTool } from "../models/tool.model";

// One of each tool's `TOOL_SIZES`.
export const DEFAULT_TOOL_SIZES: Record<StrokeTool, number> = {
  pencil: 2.5,
  eraser: 10,
};
