import { type FONTS } from "../constants/fonts.const";

// A font offered for text, by its name in `FONTS`.
export type FontName = keyof typeof FONTS;

export type TextAlign = "left" | "center" | "right";

// How a run of text looks. Anything left out comes from the note or text box,
// e.g. its font size.
export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  font?: FontName;
  // In drawing units.
  size?: number;
  // A resolved color value, like a stroke's.
  color?: string;
}

// Text that all looks the same.
export interface TextRun extends TextStyle {
  text: string;
}

export interface Paragraph {
  // Left if it's left out.
  align?: TextAlign;
  runs: TextRun[];
}

// Formatted text, as paragraphs of runs. It doesn't depend on the editor, so
// it can be saved and exported as it is.
export type RichText = Paragraph[];
