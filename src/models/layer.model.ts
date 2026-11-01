import { type ItemKind } from "./drawing.model";

/**
 * One place in the drawing's stacking order: an item, by its kind and id, or
 * strokes drawn one after another with nothing placed between them, as how
 * many of the drawing's strokes, in order.
 */
export type Layer = { kind: ItemKind; id: string } | StrokeLayer;

export interface StrokeLayer {
  kind: "strokes";
  count: number;
}
