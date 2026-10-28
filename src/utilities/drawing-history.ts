import { type Stroke } from "../models/stroke.model";

/**
 * The strokes drawn so far, and the undone strokes that can be redone. Each
 * change replaces `strokes` rather than changing it, so the canvas can tell
 * when strokes were only added.
 */
export class DrawingHistory {
  #strokes: Stroke[] = [];
  #undone: Stroke[] = [];

  get strokes(): Stroke[] {
    return this.#strokes;
  }

  get canUndo(): boolean {
    return this.#strokes.length > 0;
  }

  get canRedo(): boolean {
    return this.#undone.length > 0;
  }

  addStroke(stroke: Stroke): void {
    this.#strokes = [...this.#strokes, stroke];
    // A new stroke invalidates anything that could have been redone.
    this.#undone = [];
  }

  undo(): void {
    if (this.#strokes.length === 0) {
      return;
    }
    this.#undone = [this.#strokes[this.#strokes.length - 1], ...this.#undone];
    this.#strokes = this.#strokes.slice(0, -1);
  }

  redo(): void {
    if (this.#undone.length === 0) {
      return;
    }
    this.#strokes = [...this.#strokes, this.#undone[0]];
    this.#undone = this.#undone.slice(1);
  }
}
