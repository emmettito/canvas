import { type Tool } from "../models/tool.model";

// The key that picks each tool, like Figma's where it has the same tool.
export const TOOL_SHORTCUTS: Record<Tool, string> = {
  move: "V",
  pencil: "P",
  highlighter: "H",
  eraser: "E",
  // Like Photoshop's.
  bucket: "G",
  note: "N",
  text: "T",
  // Rectangles', though each shape has its own (see `SHAPE_SHORTCUTS`).
  shape: "R",
  dropper: "I",
};
