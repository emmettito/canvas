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
  | { type: "add-stroke"; stroke: Stroke }
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
  | { type: "clear" };
