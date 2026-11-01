import { type Point } from "./point.model";

export interface StrokePoint extends Point {
  // How hard a pen pressed there, from 0 to 1. Left out for a mouse or a
  // finger, which draw at the stroke's size throughout.
  pressure?: number;
}

export interface Stroke {
  // A resolved color value, so strokes keep their color if the theme changes.
  // An undefined color erases instead of drawing.
  color?: string;
  points: StrokePoint[];
  size: number;
  // How much of the color shows, from 0 to 1, e.g. the highlighter's, so
  // what's under it shows through. Left out for a solid stroke.
  opacity?: number;
  // How its ends and corners are drawn: square for the highlighter's, like a
  // highlighter's tip. Left out for round ones.
  cap?: "square";
}
