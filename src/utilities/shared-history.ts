import { type DrawingEdit } from "../models/collaboration.model";
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
import { createId } from "./create-id";
import { type Restack } from "./layers";

/**
 * `drawing` with every change in `edits` made in turn, apart from those
 * undone, and not redone, by a later edit.
 */
export function replayEdits(drawing: Drawing, edits: DrawingEdit[]): Drawing {
  const undone = new Set<string>();
  for (const edit of edits) {
    if (edit.type === "undo") {
      undone.add(edit.target);
    } else if (edit.type === "redo") {
      undone.delete(edit.target);
    }
  }
  let replayed = drawing;
  for (const edit of edits) {
    if (edit.type === "change" && !undone.has(edit.id)) {
      replayed = applyChange(replayed, edit.change);
    }
  }
  return replayed;
}

/**
 * A drawing shared with others through a room, which puts everyone's edits
 * in one order. It's the drawing the room started from, with every edit made
 * in that order, and then this canvas's own edits that the room hasn't sent
 * back yet, so they show straight away. Undo only undoes this canvas's own
 * changes, leaving everyone else's, even ones made since.
 */
export class SharedHistory implements History {
  #start: Drawing;
  // In the room's order.
  #edits: DrawingEdit[] = [];
  // Sent, but not yet back from the room, oldest first.
  #pending: DrawingEdit[] = [];
  // `#start` with `#edits` made, and with `#pending` made too.
  #confirmed: Drawing;
  #drawing: Drawing;
  #me: string;
  #send: (edit: DrawingEdit) => void;
  // This canvas's changes that are made, most recent last, and those it
  // undid, next to redo last.
  #mine: string[] = [];
  #undone: string[] = [];

  /**
   * Starts from `drawing`, with `edits` the room has had so far. `me` is who
   * the room says this canvas is, and `send` sends it this canvas's edits.
   */
  constructor(
    drawing: Drawing,
    edits: DrawingEdit[],
    me: string,
    send: (edit: DrawingEdit) => void
  ) {
    this.#start = drawing;
    this.#edits = [...edits];
    this.#confirmed = replayEdits(drawing, edits);
    this.#drawing = this.#confirmed;
    this.#me = me;
    this.#send = send;
  }

  get drawing(): Drawing {
    return this.#drawing;
  }

  get canUndo(): boolean {
    return this.#mine.length > 0;
  }

  get canRedo(): boolean {
    return this.#undone.length > 0;
  }

  get canClear(): boolean {
    return hasContent(this.#drawing);
  }

  addStroke(stroke: Stroke): void {
    this.#change({ type: "add-stroke", stroke });
  }

  addFill(fill: Fill): void {
    this.#change({ type: "add-fill", fill });
  }

  addItem<K extends ItemKind>(kind: K, item: DrawingItem<K>): void {
    this.#change({ type: "add-item", kind, item });
  }

  /** Only what's changed is sent, so someone else's changes to the rest stay. */
  updateItem<K extends ItemKind>(kind: K, item: DrawingItem<K>): void {
    const change = this.#getUpdate(kind, item);
    if (change) {
      this.#change(change);
    }
  }

  /** As with `updateItem`, only what's changed in each item is sent. */
  batch(changes: DrawingChange[]): void {
    this.#change({
      type: "batch",
      changes: changes.flatMap((change) =>
        change.type === "update-item"
          ? (this.#getUpdate(change.kind, {
              ...change.fields,
              id: change.id,
            } as DrawingItem<ItemKind>) ?? [])
          : [change]
      ),
    });
  }

  // The change that updates an item to `item`, with only the fields that
  // differ, or null if there's no such item.
  #getUpdate<K extends ItemKind>(
    kind: K,
    item: DrawingItem<K>
  ): DrawingChange | null {
    const items = this.#drawing[kind] as DrawingItem<K>[];
    const current = items.find(({ id }) => id === item.id) as
      | Record<string, unknown>
      | undefined;
    if (!current) {
      return null;
    }
    const fields = Object.fromEntries(
      Object.entries(item).filter(([key, value]) => current[key] !== value)
    );
    return { type: "update-item", kind, id: item.id, fields };
  }

  removeItem(kind: ItemKind, id: string): void {
    this.#change({ type: "remove-item", kind, id });
  }

  restackItem(kind: ItemKind, id: string, to: Restack): void {
    this.#change({ type: "restack-item", kind, id, to });
  }

  setBackground(color: string): void {
    this.#change({ type: "set-background", color });
  }

  // It can't be undone, nor can this canvas's changes before it.
  clear(): void {
    this.#change({ type: "clear" });
    this.#mine = [];
    this.#undone = [];
  }

  undo(): void {
    const target = this.#mine.pop();
    if (target !== undefined) {
      this.#undone.push(target);
      this.#edit({ id: createId(), author: this.#me, type: "undo", target });
    }
  }

  redo(): void {
    const target = this.#undone.pop();
    if (target !== undefined) {
      this.#mine.push(target);
      this.#edit({ id: createId(), author: this.#me, type: "redo", target });
    }
  }

  /** Makes an edit from the room, which may be one this canvas sent. */
  receive(edit: DrawingEdit): void {
    if (this.#pending[0]?.id === edit.id && edit.author === this.#me) {
      this.#pending.shift();
    }
    this.#edits.push(edit);
    // Undoing or redoing can change what every later change does, so they're
    // all made again.
    this.#confirmed =
      edit.type === "change"
        ? applyChange(this.#confirmed, edit.change)
        : replayEdits(this.#start, this.#edits);
    this.#show();
  }

  // A change that changes nothing, e.g. clearing a blank drawing, isn't
  // sent, so there's nothing to undo.
  #change(change: DrawingChange): void {
    if (applyChange(this.#drawing, change) === this.#drawing) {
      return;
    }
    const edit: DrawingEdit = {
      id: createId(),
      author: this.#me,
      type: "change",
      change,
    };
    this.#mine.push(edit.id);
    // A new change invalidates anything that could have been redone.
    this.#undone = [];
    this.#edit(edit);
  }

  #edit(edit: DrawingEdit): void {
    this.#pending.push(edit);
    this.#send(edit);
    this.#show();
  }

  // The room's drawing, with this canvas's edits it hasn't sent back yet.
  #show(): void {
    let drawing = this.#confirmed;
    for (const edit of this.#pending) {
      if (edit.type !== "change") {
        drawing = replayEdits(this.#start, [...this.#edits, ...this.#pending]);
        break;
      }
      drawing = applyChange(drawing, edit.change);
    }
    this.#drawing = drawing;
  }
}
