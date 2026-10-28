import {
  type Drawing,
  type DrawingItem,
  type ItemKind,
} from "../models/drawing.model";
import { type Stroke } from "../models/stroke.model";

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

  addStroke(stroke: Stroke): void {
    this.change({ ...this.#drawing, strokes: [...this.strokes, stroke] });
  }

  /** Places an item above the others of its kind. */
  addItem<K extends ItemKind>(kind: K, item: DrawingItem<K>): void {
    this.#changeItems(kind, [...this.#getItems(kind), item]);
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
      this.#getItems(kind).filter((item) => item.id !== id)
    );
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

  #changeItems<K extends ItemKind>(kind: K, items: DrawingItem<K>[]): void {
    this.change({ ...this.#drawing, [kind]: items });
  }
}
