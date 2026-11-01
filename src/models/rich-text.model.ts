import { type FONTS } from "../constants/fonts.const";

// A font offered for text, by its name in `FONTS`.
export type FontName = keyof typeof FONTS;

export type TextAlign = "left" | "center" | "right";

// A list a paragraph is an item of: bulleted, or numbered in order.
export type ListType = "bullet" | "ordered";

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
  // Where it links to: an http, https or mailto address.
  link?: string;
}

// Text that all looks the same.
export interface TextRun extends TextStyle {
  text: string;
}

export interface Paragraph {
  // Left if it's left out.
  align?: TextAlign;
  // The list it's an item of, if any, and how far in it's nested, from 0 for
  // an item that isn't. Items next to each other are the same list.
  list?: ListType;
  level?: number;
  runs: TextRun[];
}

// Formatted text, as paragraphs of runs. It doesn't depend on the editor, so
// it can be saved and exported as it is.
export type RichText = Paragraph[];
