import { describe, expect, it } from "vitest";
import { CollaborationServer } from "../collaboration-server";
import { type CanvasServerMessage } from "../models/collaboration.model";
import { type Drawing } from "../models/drawing.model";
import { type Note } from "../models/note.model";
import { type Stroke } from "../models/stroke.model";
import { fromPlainText } from "./rich-text";
import { SharedHistory } from "./shared-history";

function createStroke(
  x: number,
  color: string | undefined = "#000000"
): Stroke {
  return { color, points: [{ x, y: 0 }], size: 1 };
}

function createNote(id: string): Note {
  return {
    id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    color: "#ffff99",
    content: fromPlainText("Note"),
    strokes: [],
    fills: [],
  };
}

const BLANK: Drawing = {
  background: "#ffffff",
  strokes: [],
  fills: [],
  images: [],
  texts: [],
  notes: [],
  order: [],
};

/**
 * Canvases in one room on a server, whose messages wait until `flush`, as
 * they would on their way over a network.
 */
function createRoom() {
  const server = new CollaborationServer();
  const queue: (() => void)[] = [];
  const flush = () => {
    while (queue.length > 0) {
      queue.shift()!();
    }
  };
  const join = (drawing: Drawing = BLANK) => {
    let history: SharedHistory | null = null;
    const connection = server.connect((message) =>
      queue.push(() => {
        const received = message as CanvasServerMessage;
        if (received.type === "welcome") {
          history = new SharedHistory(
            received.drawing,
            received.edits,
            received.you,
            (edit) =>
              queue.push(() => connection.receive({ type: "edit", edit }))
          );
        } else if (received.type === "edit") {
          history!.receive(received.edit);
        }
      })
    );
    connection.receive({ type: "join", room: "room", name: "", drawing });
    flush();
    return { history: history!, connection };
  };
  return { join, flush };
}

describe("SharedHistory", () => {
  it("starts from the drawing of whoever joined first", () => {
    const room = createRoom();
    const first = room.join({ ...BLANK, strokes: [createStroke(1)] });
    const second = room.join({ ...BLANK, strokes: [createStroke(2)] });

    expect(first.history.drawing.strokes).toEqual([createStroke(1)]);
    expect(second.history.drawing.strokes).toEqual([createStroke(1)]);
  });

  it("shows its own changes straight away, and everyone's once they're back", () => {
    const room = createRoom();
    const a = room.join().history;
    const b = room.join().history;

    a.addStroke(createStroke(1));
    expect(a.drawing.strokes).toEqual([createStroke(1)]);
    expect(b.drawing.strokes).toEqual([]);

    room.flush();
    expect(b.drawing.strokes).toEqual([createStroke(1)]);
  });

  it("ends up the same for everyone, in the room's order", () => {
    const room = createRoom();
    const a = room.join().history;
    const b = room.join().history;

    // Both draw before either hears of the other's.
    a.addStroke(createStroke(1));
    b.addStroke(createStroke(2));
    room.flush();

    expect(a.drawing).toEqual(b.drawing);
    expect(a.drawing.strokes).toEqual([createStroke(1), createStroke(2)]);
    expect(a.drawing.order).toEqual([{ kind: "strokes", count: 2 }]);
  });

  it("undoes only its own changes, keeping everyone else's since", () => {
    const room = createRoom();
    const a = room.join().history;
    const b = room.join().history;

    a.addStroke(createStroke(1));
    room.flush();
    b.addStroke(createStroke(2));
    room.flush();
    expect(b.canUndo).toBe(true);

    a.undo();
    room.flush();
    expect(a.drawing.strokes).toEqual([createStroke(2)]);
    expect(b.drawing.strokes).toEqual([createStroke(2)]);
    expect(a.canUndo).toBe(false);
    expect(a.canRedo).toBe(true);

    a.redo();
    room.flush();
    expect(b.drawing.strokes).toEqual([createStroke(1), createStroke(2)]);
    expect(a.canRedo).toBe(false);
  });

  it("keeps someone else's change to a note while it's moved", () => {
    const room = createRoom();
    const a = room.join().history;
    const b = room.join().history;
    a.addItem("notes", createNote("n"));
    room.flush();

    a.updateItem("notes", { ...createNote("n"), x: 50 });
    b.updateItem("notes", { ...createNote("n"), content: fromPlainText("Hi") });
    room.flush();

    expect(a.drawing.notes).toEqual([
      { ...createNote("n"), x: 50, content: fromPlainText("Hi") },
    ]);
    expect(b.drawing).toEqual(a.drawing);
  });

  it("sends only what a batch changes in each item, so others' changes stay", () => {
    const room = createRoom();
    const a = room.join().history;
    const b = room.join().history;
    a.addItem("notes", createNote("n"));
    a.addItem("notes", createNote("m"));
    room.flush();

    a.batch([
      {
        type: "update-item",
        kind: "notes",
        id: "n",
        fields: { ...createNote("n"), x: 50 },
      },
      {
        type: "update-item",
        kind: "notes",
        id: "m",
        fields: { ...createNote("m"), x: 50 },
      },
    ]);
    b.updateItem("notes", { ...createNote("n"), content: fromPlainText("Hi") });
    room.flush();

    expect(a.drawing.notes).toEqual([
      { ...createNote("n"), x: 50, content: fromPlainText("Hi") },
      { ...createNote("m"), x: 50 },
    ]);
    expect(b.drawing).toEqual(a.drawing);

    a.undo();
    room.flush();
    expect(a.drawing.notes.map(({ x }) => x)).toEqual([0, 0]);
  });

  it("only erases fills with erasers drawn after them, wherever they land", () => {
    const room = createRoom();
    const a = room.join().history;
    const b = room.join().history;

    b.addStroke(createStroke(1));
    // Filled before hearing of B's stroke.
    a.addFill({ color: "#ff0000", rings: [], after: 0 });
    room.flush();

    expect(a.drawing.fills).toEqual([
      { color: "#ff0000", rings: [], after: 1 },
    ]);
    expect(b.drawing).toEqual(a.drawing);
  });

  it("sends nothing for a change that changes nothing", () => {
    const room = createRoom();
    const a = room.join().history;

    a.clear();
    a.setBackground("#ffffff");
    room.flush();

    expect(a.canUndo).toBe(false);
  });

  it("brings someone who joins later up to date, undoing included", () => {
    const room = createRoom();
    const a = room.join().history;
    a.addStroke(createStroke(1));
    a.addStroke(createStroke(2));
    a.undo();
    room.flush();

    const late = room.join().history;
    expect(late.drawing).toEqual(a.drawing);
    expect(late.drawing.strokes).toEqual([createStroke(1)]);
    // Nothing of its own to undo.
    expect(late.canUndo).toBe(false);
  });
});
