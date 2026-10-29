import { type Fill } from "./fill.model";
import { type RichText } from "./rich-text.model";
import { type Stroke } from "./stroke.model";

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
  // Drawn on the note, from its top left corner, so they move with it. They
  // don't stretch when it's resized, and only show inside it.
  strokes: Stroke[];
  // Filled with the paint bucket, below its text and strokes, from its top
  // left corner like them.
  fills: Fill[];
}
