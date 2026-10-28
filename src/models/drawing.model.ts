import { type ImageItem } from "./image-item.model";
import { type Note } from "./note.model";
import { type Stroke } from "./stroke.model";
import { type TextBox } from "./text-box.model";

// One version of the drawing in the undo history. Images, text and notes are
// above every stroke, so the eraser doesn't erase them.
export interface Drawing {
  // The color behind everything, e.g. "#ffffff". It's the drawing's own, so
  // the page's theme doesn't change it, and exports keep it.
  background: string;
  strokes: Stroke[];
  images: ImageItem[];
  texts: TextBox[];
  notes: Note[];
}

// What's placed on top of the strokes, by the drawing's name for it.
export type ItemKind = "images" | "texts" | "notes";

export type DrawingItem<K extends ItemKind> = Drawing[K][number];
