import { type ItemKind } from "../models/drawing.model";

// Every kind of item, bottom to top the way drawings saved before they had
// a stacking order showed them.
export const ITEM_KINDS: ItemKind[] = ["images", "texts", "notes"];
