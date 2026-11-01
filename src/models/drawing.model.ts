import { type Fill } from "./fill.model";
import { type ImageItem } from "./image-item.model";
import { type Layer } from "./layer.model";
import { type Note } from "./note.model";
import { type Stroke } from "./stroke.model";
import { type TextBox } from "./text-box.model";

// One version of the drawing in the undo history. Strokes, images, text and
// notes are stacked in one order, and the eraser only erases
// strokes.
export interface Drawing {
  // The color behind everything, e.g. "#ffffff". It's the drawing's own, so
  // the page's theme doesn't change it, and exports keep it.
  background: string;
  strokes: Stroke[];
  // Filled with the paint bucket, oldest first, below everything else.
  fills: Fill[];
  images: ImageItem[];
  texts: TextBox[];
  notes: Note[];
  // Bottom to top: every item, and the strokes in runs between them.
  order: Layer[];
}

// What's placed on the drawing, rather than drawn, by the drawing's name for
// it.
export type ItemKind = "images" | "texts" | "notes";

export type DrawingItem<K extends ItemKind> = Drawing[K][number];
