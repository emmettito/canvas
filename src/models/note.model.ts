import { type RichText } from "./rich-text.model";

// A sticky note on the drawing, in drawing units.
export interface Note {
  id: string;
  // The top left corner.
  x: number;
  y: number;
  width: number;
  height: number;
  // A resolved color value, like a stroke's, so it keeps its color if the
  // theme changes.
  color: string;
  content: RichText;
}
