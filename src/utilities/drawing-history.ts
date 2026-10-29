import {
  type Drawing,
  type DrawingItem,
  type ItemKind,
} from "../models/drawing.model";
import { type Stroke } from "../models/stroke.model";
import {
  addItemLayer,
  addStrokeLayer,
  removeItemLayer,
  type Restack,
  restackItemLayer,
} from "./layers";

/**
 * The current drawing, and the earlier and undone versions of it. Each change
 * replaces the drawing and its `strokes` rather than changing them, so the
 * canvas can tell when strokes were only added, and so old versions can be
 * kept cheaply.
 */
export class DrawingHistory {
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

  /** Whether anything is drawn or placed. */
  get canClear(): boolean {
    const { strokes, images, texts, notes } = this.#drawing;
    return (
      strokes.length > 0 ||
      images.length > 0 ||
      texts.length > 0 ||
      notes.length > 0
    );
  }

  /** Draws a stroke on top of everything. */
  addStroke(stroke: Stroke): void {
    this.change({
      ...this.#drawing,
      strokes: [...this.strokes, stroke],
      order: addStrokeLayer(this.#drawing.order),
    });
  }

  /** Places an item on top of everything. */
  addItem<K extends ItemKind>(kind: K, item: DrawingItem<K>): void {
    this.#changeItems(
      kind,
      [...this.#getItems(kind), item],
      addItemLayer(this.#drawing.order, kind, item.id)
    );
  }

  /** Replaces the item with the same id, e.g. once it's moved. */
  updateItem<K extends ItemKind>(kind: K, item: DrawingItem<K>): void {
    this.#changeItems(
      kind,
      this.#getItems(kind).map((other) => (other.id === item.id ? item : other))
    );
  }

  removeItem(kind: ItemKind, id: string): void {
    this.#changeItems(
      kind,
      this.#getItems(kind).filter((item) => item.id !== id),
      removeItemLayer(this.#drawing.order, kind, id)
    );
  }

  /**
   * Moves an item to the front, above everything, or the back. Nothing
   * changes, so there's nothing to undo, if it's already there.
   */
  restackItem(kind: ItemKind, id: string, to: Restack): void {
    const order = restackItemLayer(this.#drawing.order, kind, id, to);
    if (order !== this.#drawing.order) {
      this.change({ ...this.#drawing, order });
    }
  }

  /** Removes everything. Like adding a stroke, it can be undone. */
  clear(): void {
    if (!this.canClear) {
      return;
    }
    // The background stays.
    this.change({
      ...this.#drawing,
      strokes: [],
      images: [],
      texts: [],
      notes: [],
      order: [],
    });
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

  #getItems<K extends ItemKind>(kind: K): DrawingItem<K>[] {
    return this.#drawing[kind] as DrawingItem<K>[];
  }

  #changeItems<K extends ItemKind>(
    kind: K,
    items: DrawingItem<K>[],
    order = this.#drawing.order
  ): void {
    this.change({ ...this.#drawing, [kind]: items, order });
  }
}
