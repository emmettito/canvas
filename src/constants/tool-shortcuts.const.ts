import { type Tool } from "../models/tool.model";

// The key that picks each tool, like Figma's where it has the same tool.
export const TOOL_SHORTCUTS: Record<Tool, string> = {
  move: "V",
  pencil: "P",
  eraser: "E",
  // Like Photoshop's.
  bucket: "G",
  note: "N",
  text: "T",
  dropper: "I",
};
