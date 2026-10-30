import { type ItemKind } from "../models/drawing.model";

// Every kind of item, bottom to top the way drawings saved before they had
// a stacking order showed them. Shapes came after the stacking order, so
// they're never stacked this way.
export const ITEM_KINDS: ItemKind[] = ["images", "texts", "notes", "shapes"];
