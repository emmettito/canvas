import { type DrawingItem, type ItemKind } from "./drawing.model";
import { type Stroke, type StrokePoint } from "./stroke.model";

/**
 * What someone's in the middle of on the canvas, before it's a change to the
 * drawing, so everyone drawing together sees it as it happens.
 */
export type Activity =
  // A stroke being drawn, on the note with id `note`, from its top left
  // corner, or else on the drawing.
  | { type: "stroke"; note: string | null; stroke: Stroke }
  // An item being moved or resized, where it is so far.
  | {
      type: "move";
      kind: ItemKind;
      id: string;
      box: Pick<DrawingItem<ItemKind>, "x" | "y"> & {
        width?: number | null;
        height?: number | null;
      };
    }
  // A note or text box being typed in, as it is so far. A new one isn't in
  // the drawing yet, so it's all there, but a note's strokes and fills are
  // left out, since typing doesn't change them.
  | {
      type: "typing";
      kind: "notes" | "texts";
      item: DrawingItem<"notes" | "texts">;
    };

/**
 * An activity as it's sent to everyone else: a stroke's points since the
 * last time it was sent, after the `from` points sent before, so a long
 * stroke isn't sent again and again.
 */
export type SharedActivity =
  | Exclude<Activity, { type: "stroke" }>
  | {
      type: "stroke";
      note: string | null;
      color?: string;
      size: number;
      opacity?: number;
      from: number;
      points: StrokePoint[];
    };
