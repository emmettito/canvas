import { type DrawingChange } from "../models/drawing-change.model";
import {
  type Drawing,
  type DrawingItem,
  type ItemKind,
} from "../models/drawing.model";
import { type Fill } from "../models/fill.model";
import { type History } from "../models/history.model";
import { type Stroke } from "../models/stroke.model";
import { applyChange, hasContent } from "./apply-change";
import { type Restack } from "./layers";

/**
 * The current drawing, and the earlier and undone versions of it. Each change
 * replaces the drawing and its `strokes` rather than changing them, so the
 * canvas can tell when strokes were only added, and so old versions can be
 * kept cheaply.
 */
export class DrawingHistory implements History {
  #drawing: Drawing;
  // Most recent last.
  #past: Drawing[] = [];
  // Next to redo first.
  #undone: Drawing[] = [];

  constructor(drawing: Drawing) {
    this.#drawing = drawing;
  }

  get drawing(): Drawing {
    return this.#drawing;
  }

  get strokes(): Stroke[] {
    return this.#drawing.strokes;
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#undone.length > 0;
  }

  get canClear(): boolean {
    return hasContent(this.#drawing);
  }

  addStroke(stroke: Stroke): void {
    this.#apply({ type: "add-stroke", stroke });
  }

  addFill(fill: Fill): void {
    this.#apply({ type: "add-fill", fill });
  }

  addItem<K extends ItemKind>(kind: K, item: DrawingItem<K>): void {
    this.#apply({ type: "add-item", kind, item });
  }

  updateItem<K extends ItemKind>(kind: K, item: DrawingItem<K>): void {
    this.#apply({ type: "update-item", kind, id: item.id, fields: item });
  }

  removeItem(kind: ItemKind, id: string): void {
    this.#apply({ type: "remove-item", kind, id });
  }

  /**
   * Nothing changes, so there's nothing to undo, if it's already at the
   * front, or the back.
   */
  restackItem(kind: ItemKind, id: string, to: Restack): void {
    this.#apply({ type: "restack-item", kind, id, to });
  }

  setBackground(color: string): void {
    this.#apply({ type: "set-background", color });
  }

  /** Like adding a stroke, it can be undone. */
  clear(): void {
    this.#apply({ type: "clear" });
  }

  /** Replaces the drawing, so it can be undone. */
  change(drawing: Drawing): void {
    this.#past = [...this.#past, this.#drawing];
    this.#drawing = drawing;
    // A new change invalidates anything that could have been redone.
    this.#undone = [];
  }

  /** Starts again from `drawing`, forgetting everything to undo or redo. */
  reset(drawing: Drawing): void {
    this.#drawing = drawing;
    this.#past = [];
    this.#undone = [];
  }

  undo(): void {
    const previous = this.#past.at(-1);
    if (!previous) {
      return;
    }
    this.#past = this.#past.slice(0, -1);
    this.#undone = [this.#drawing, ...this.#undone];
    this.#drawing = previous;
  }

  redo(): void {
    const [next] = this.#undone;
    if (!next) {
      return;
    }
    this.#undone = this.#undone.slice(1);
    this.#past = [...this.#past, this.#drawing];
    this.#drawing = next;
  }

  // A change that changes nothing, e.g. clearing a blank drawing, has nothing
  // to undo.
  #apply(change: DrawingChange): void {
    const drawing = applyChange(this.#drawing, change);
    if (drawing !== this.#drawing) {
      this.change(drawing);
    }
  }
}
