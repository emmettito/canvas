import { type ToolColor } from "./color.model";

export interface ToolState {
  // An undefined color erases.
  color?: ToolColor;
  size: number;
}
