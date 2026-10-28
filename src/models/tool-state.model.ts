import { type Color } from "./color.model";

export interface ToolState {
  // An undefined color erases.
  color?: Color;
  size: number;
}
