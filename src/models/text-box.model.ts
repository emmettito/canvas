import { type RichText } from "./rich-text.model";

// Text on the drawing, in drawing units.
export interface TextBox {
  id: string;
  // The top left corner.
  x: number;
  y: number;
  // How wide it wraps at, or null to be as wide as its longest line.
  width: number | null;
  // How tall it is, or null to fit the text. It's never shorter than the
  // text, so none is hidden.
  height: number | null;
  // The text's own size and color, where it isn't formatted otherwise.
  fontSize: number;
  // A resolved color value, like a stroke's.
  color: string;
  content: RichText;
}
