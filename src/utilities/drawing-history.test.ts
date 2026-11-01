import { describe, expect, it } from "vitest";
import { type Drawing } from "../models/drawing.model";
import { type Note } from "../models/note.model";
import { type Stroke } from "../models/stroke.model";
import { DrawingHistory } from "./drawing-history";
import { fromPlainText } from "./rich-text";

function createStroke(x: number): Stroke {
  return { color: "#000000", points: [{ x, y: 0 }], size: 1 };
}

function createNote(id: string, text = "Note"): Note {
  return {
    id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    color: "#ffff99",
    content: fromPlainText(text),
    strokes: [],
    fills: [],
  };
}

function createDrawing(strokes: Stroke[] = []): Drawing {
  return {
    background: "#ffffff",
    strokes,
    fills: [],
    images: [],
    texts: [],
    notes: [],
    order:
      strokes.length > 0 ? [{ kind: "strokes", count: strokes.length }] : [],
  };
}

function createHistory(strokes: Stroke[] = []): DrawingHistory {
  return new DrawingHistory(createDrawing(strokes));
}

describe("DrawingHistory", () => {
  it("starts empty", () => {
    const history = createHistory();

    expect(history.strokes).toEqual([]);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("undoes and redoes strokes in order", () => {
    const first = createStroke(1);
    const second = createStroke(2);
    const history = createHistory();

    history.addStroke(first);
    history.addStroke(second);
    history.undo();
    expect(history.strokes).toEqual([first]);
    expect(history.canRedo).toBe(true);

    history.undo();
    expect(history.strokes).toEqual([]);
    expect(history.canUndo).toBe(false);

    history.redo();
    expect(history.strokes).toEqual([first]);

    history.redo();
    expect(history.strokes).toEqual([first, second]);
    expect(history.canRedo).toBe(false);
  });

  it("clears redo when a new stroke is added", () => {
    const history = createHistory();

    history.addStroke(createStroke(1));
    history.undo();
    history.addStroke(createStroke(2));

    expect(history.canRedo).toBe(false);
  });

  it("ignores undo and redo when there is nothing to do", () => {
    const history = createHistory();
    const { strokes } = history;

    history.undo();
    history.redo();

    // The same array means the strokes weren't replaced.
    expect(history.strokes).toBe(strokes);
  });

  it("clears strokes for good, so neither it nor what came before undoes", () => {
    const history = createHistory();

    history.addStroke(createStroke(1));
    history.addStroke(createStroke(2));
    history.undo();
    history.clear();
    expect(history.strokes).toEqual([]);
    expect(history.canClear).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);

    history.undo();
    expect(history.strokes).toEqual([]);
  });

  it("ignores clear when there is nothing to clear", () => {
    const history = createHistory();

    history.clear();

    expect(history.canUndo).toBe(false);
  });

  it("starts with the given strokes, which can't be undone", () => {
    const stroke = createStroke(1);
    const history = createHistory([stroke]);

    expect(history.strokes).toEqual([stroke]);
    expect(history.canUndo).toBe(false);
    expect(history.canClear).toBe(true);
  });

  it("forgets everything to undo and redo when reset", () => {
    const history = createHistory();
    history.addStroke(createStroke(1));
    history.addStroke(createStroke(2));
    history.undo();
    const drawing = createDrawing();

    history.reset(drawing);

    expect(history.drawing).toBe(drawing);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("undoes and redoes a change to the whole drawing", () => {
    const history = createHistory([createStroke(1)]);
    const before = history.drawing;
    const changed = createDrawing([createStroke(2)]);

    history.change(changed);
    expect(history.drawing).toBe(changed);

    history.undo();
    expect(history.drawing).toBe(before);

    history.redo();
    expect(history.drawing).toBe(changed);
  });

  it("replaces the strokes array on each change", () => {
    const history = createHistory();
    const { strokes } = history;

    history.addStroke(createStroke(1));

    expect(strokes).toEqual([]);
  });

  it("adds, changes and removes items, each of which can be undone", () => {
    const note = createNote("a");
    const history = createHistory();

    history.addItem("notes", note);
    expect(history.drawing.notes).toEqual([note]);
    expect(history.canClear).toBe(true);

    const moved = { ...note, x: 50 };
    history.updateItem("notes", moved);
    expect(history.drawing.notes).toEqual([moved]);

    history.removeItem("notes", "a");
    expect(history.drawing.notes).toEqual([]);

    history.undo();
    expect(history.drawing.notes).toEqual([moved]);
    history.undo();
    expect(history.drawing.notes).toEqual([note]);
  });

  it("makes a batch of changes as one, which undo and redo together", () => {
    const history = createHistory();
    history.addItem("notes", createNote("a"));
    const image = { id: "b", x: 0, y: 0, width: 10, height: 10 };

    history.batch([
      {
        type: "update-item",
        kind: "notes",
        id: "a",
        fields: { ...createNote("a"), x: 50 },
      },
      { type: "add-item", kind: "images", item: image },
    ]);
    expect(history.drawing.notes[0].x).toBe(50);
    expect(history.drawing.images).toEqual([image]);

    history.undo();
    expect(history.drawing.notes[0].x).toBe(0);
    expect(history.drawing.images).toEqual([]);
    history.redo();
    expect(history.drawing.images).toEqual([image]);
  });

  it("has nothing to undo for a batch that changes nothing", () => {
    const history = createHistory();

    history.batch([{ type: "remove-item", kind: "notes", id: "a" }]);

    expect(history.canUndo).toBe(false);
  });

  it("only changes the kind of item it's given", () => {
    const history = createHistory();
    const image = { id: "a", x: 0, y: 0, width: 10, height: 10 };

    history.addItem("images", image);
    history.updateItem("notes", createNote("a"));

    expect(history.drawing.images).toEqual([image]);
    expect(history.drawing.notes).toEqual([]);
  });

  it("clears every kind of item along with strokes", () => {
    const history = createHistory([createStroke(1)]);
    history.addItem("notes", createNote("a"));
    history.addItem("images", { id: "b", x: 0, y: 0, width: 1, height: 1 });
    history.addItem("texts", {
      id: "c",
      x: 0,
      y: 0,
      width: null,
      height: null,
      fontSize: 24,
      color: "#000000",
      content: fromPlainText("Hi"),
    });

    history.clear();
    expect(history.drawing).toEqual(createDrawing());
    expect(history.canClear).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it("keeps the background when clearing", () => {
    const history = new DrawingHistory({
      ...createDrawing([createStroke(1)]),
      background: "#000000",
    });

    history.clear();

    expect(history.drawing.background).toBe("#000000");
  });

  it("stacks strokes and items in the order they're added", () => {
    const history = createHistory([createStroke(1)]);

    history.addItem("notes", createNote("a"));
    history.addStroke(createStroke(2));
    history.addStroke(createStroke(3));

    expect(history.drawing.order).toEqual([
      { kind: "strokes", count: 1 },
      { kind: "notes", id: "a" },
      { kind: "strokes", count: 2 },
    ]);
  });

  it("joins the strokes either side of a removed item", () => {
    const history = createHistory([createStroke(1)]);
    history.addItem("notes", createNote("a"));
    history.addStroke(createStroke(2));

    history.removeItem("notes", "a");

    expect(history.drawing.order).toEqual([{ kind: "strokes", count: 2 }]);
    history.undo();
    expect(history.drawing.order).toHaveLength(3);
  });

  it("brings items to the front and sends them to the back", () => {
    const history = createHistory([createStroke(1)]);
    history.addItem("notes", createNote("a"));
    history.addItem("notes", createNote("b"));

    history.restackItem("notes", "b", "back");
    expect(history.drawing.order).toEqual([
      { kind: "notes", id: "b" },
      { kind: "strokes", count: 1 },
      { kind: "notes", id: "a" },
    ]);

    // Already there, so there's nothing new to undo.
    history.restackItem("notes", "b", "back");
    history.undo();
    expect(history.drawing.order.at(-1)).toEqual({ kind: "notes", id: "b" });
  });

  it("clears the order with everything else", () => {
    const history = createHistory([createStroke(1)]);
    history.addItem("notes", createNote("a"));

    history.clear();

    expect(history.drawing.order).toEqual([]);
  });

  it("fills areas, which can be undone and cleared", () => {
    const history = createHistory();
    const fill = { color: "#ff0000", rings: [], after: 0 };

    history.addFill(fill);
    expect(history.drawing.fills).toEqual([fill]);
    expect(history.canClear).toBe(true);

    history.clear();
    expect(history.drawing.fills).toEqual([]);
    history.undo();
    history.undo();
    expect(history.drawing.fills).toEqual([]);
    expect(history.canUndo).toBe(false);
  });
});
