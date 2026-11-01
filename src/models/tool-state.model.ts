import { type ToolColor } from "./color.model";

export interface ToolState {
  // An undefined color erases.
  color?: ToolColor;
  size: number;
  // How much of the color its strokes show, e.g. the highlighter's. It comes
  // from the tool, so it isn't saved with it.
  opacity?: number;
  // Square for a tool that draws square ends, e.g. the highlighter. It comes
  // from the tool too.
  cap?: "square";
}
