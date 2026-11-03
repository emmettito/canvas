import { type Tool } from "../models/tool.model";

// The key that picks each tool, like FigJam's where it has the same tool. A
// key with Shift is written "Shift+M".
export const TOOL_SHORTCUTS: Record<Tool, string> = {
  select: "V",
  hand: "H",
  pencil: "M",
  highlighter: "Shift+M",
  eraser: "E",
  // Like Photoshop's.
  bucket: "G",
  note: "S",
  text: "T",
  dropper: "I",
};
