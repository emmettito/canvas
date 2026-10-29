import { type Restack } from "../utilities/layers";
import { type Drawing, type DrawingItem, type ItemKind } from "./drawing.model";
import { type Fill } from "./fill.model";
import { type Stroke } from "./stroke.model";

/**
 * The drawing being worked on, the changes made to it, and undoing and
 * redoing them, whether it's drawn alone or together.
 */
export interface History {
  readonly drawing: Drawing;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Whether anything is drawn or placed. */
  readonly canClear: boolean;
  /** Draws a stroke on top of everything. */
  addStroke(stroke: Stroke): void;
  /** Fills an area, below everything but older fills. */
  addFill(fill: Fill): void;
  /** Places an item on top of everything. */
  addItem<K extends ItemKind>(kind: K, item: DrawingItem<K>): void;
  /** Replaces the item with the same id, e.g. once it's moved. */
  updateItem<K extends ItemKind>(kind: K, item: DrawingItem<K>): void;
  removeItem(kind: ItemKind, id: string): void;
  /** Moves an item to the front, above everything, or the back. */
  restackItem(kind: ItemKind, id: string, to: Restack): void;
  setBackground(color: string): void;
  /** Removes everything but the background. */
  clear(): void;
  undo(): void;
  redo(): void;
}
