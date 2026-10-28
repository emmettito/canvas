import { type Point } from "./point.model";

export interface Stroke {
  // A resolved color value, so strokes keep their color if the theme changes.
  // An undefined color erases instead of drawing.
  color?: string;
  points: Point[];
  size: number;
}
