import { type Restack } from "../utilities/layers";
import { type DrawingItem, type ItemKind } from "./drawing.model";
import { type Fill } from "./fill.model";
import { type Stroke } from "./stroke.model";

/**
 * One change to a drawing, as what was done rather than what it made, so it
 * can be applied again to a drawing someone else has changed meanwhile, e.g.
 * while drawing together.
 */
export type DrawingChange =
  // An eraser is added as a stroke, and cuts the strokes it touches.
  | { type: "add-stroke"; stroke: Stroke }
  // Only what changed, e.g. where it is once it's moved. It's a stroke's or
  // an eraser's, whichever has the id.
  | { type: "update-stroke"; id: string; fields: Partial<Stroke> }
  | { type: "remove-stroke"; id: string }
  | { type: "restack-stroke"; id: string; to: Restack }
  | { type: "add-fill"; fill: Fill }
  | { type: "add-item"; kind: ItemKind; item: DrawingItem<ItemKind> }
  // Only what changed, e.g. where it is once it's moved, so changes to the
  // rest of it meanwhile are kept.
  | {
      type: "update-item";
      kind: ItemKind;
      id: string;
      fields: Partial<DrawingItem<ItemKind>>;
    }
  | { type: "remove-item"; kind: ItemKind; id: string }
  | { type: "restack-item"; kind: ItemKind; id: string; to: Restack }
  | { type: "set-background"; color: string }
  | { type: "clear" }
  // Several at once, in turn, e.g. moving everything picked, which undo
  // together.
  | { type: "batch"; changes: DrawingChange[] };
