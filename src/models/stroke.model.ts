import { Point } from "./point.model";

export interface Stroke {
  // An undefined color erases instead of drawing.
  color?: string;
  points: Point[];
  size: number;
}
