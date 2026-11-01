// The kinds of shape the shape tool draws.
export type ShapeType = "rectangle" | "ellipse" | "line" | "arrow";

/**
 * A shape on the drawing, in drawing units. A rectangle or ellipse fills its
 * box, from its top left corner. A line or arrow goes from `x` and `y` to
 * `width` and `height` further on, which can be negative, e.g. to point up
 * or left, and an arrow points to its end.
 */
export interface Shape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  // A resolved color value, like a stroke's, for its outline or line.
  color: string;
  // How wide its outline or line is.
  strokeWidth: number;
  // What's inside a rectangle or ellipse, from the paint bucket, as a
  // resolved color value, or null to show what's under it. Lines have none.
  fill: string | null;
}
