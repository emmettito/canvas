import { type DrawingChange } from "../models/drawing-change.model";
import {
  type Drawing,
  type DrawingItem,
  type ItemKind,
} from "../models/drawing.model";
import {
  addItemLayer,
  addStrokeLayer,
  removeItemLayer,
  restackItemLayer,
} from "./layers";

/** Whether anything is drawn or placed. */
export function hasContent(drawing: Drawing): boolean {
  const { strokes, fills, images, texts, notes, shapes } = drawing;
  return (
    strokes.length > 0 ||
    fills.length > 0 ||
    images.length > 0 ||
    texts.length > 0 ||
    notes.length > 0 ||
    shapes.length > 0
  );
}

function getItems<K extends ItemKind>(
  drawing: Drawing,
  kind: K
): DrawingItem<K>[] {
  return drawing[kind] as DrawingItem<K>[];
}

/**
 * The drawing once `change` is made. It's replaced rather than changed, along
 * with only the parts that change, so the canvas can tell what did. The same
 * drawing if nothing changes, e.g. clearing a blank one, or changing an item
 * someone else removed.
 */
export function applyChange(drawing: Drawing, change: DrawingChange): Drawing {
  switch (change.type) {
    case "add-stroke":
      return {
        ...drawing,
        strokes: [...drawing.strokes, change.stroke],
        order: addStrokeLayer(drawing.order),
      };
    case "add-fill": {
      // Erasers drawn after it erase it, whatever was drawn before it,
      // which can differ when it's applied to someone else's drawing.
      const after = drawing.strokes.length;
      const { fill } = change;
      return {
        ...drawing,
        fills: [
          ...drawing.fills,
          fill.after === after ? fill : { ...fill, after },
        ],
      };
    }
    case "add-item": {
      const { kind, item } = change;
      const items = getItems(drawing, kind);
      if (items.some(({ id }) => id === item.id)) {
        return drawing;
      }
      return {
        ...drawing,
        [kind]: [...items, item],
        order: addItemLayer(drawing.order, kind, item.id),
      };
    }
    case "update-item": {
      const { kind, id, fields } = change;
      const items = getItems(drawing, kind);
      if (!items.some((item) => item.id === id)) {
        return drawing;
      }
      return {
        ...drawing,
        [kind]: items.map((item) =>
          item.id === id ? { ...item, ...fields, id } : item
        ),
      };
    }
    case "remove-item": {
      const { kind, id } = change;
      const items = getItems(drawing, kind);
      if (!items.some((item) => item.id === id)) {
        return drawing;
      }
      return {
        ...drawing,
        [kind]: items.filter((item) => item.id !== id),
        order: removeItemLayer(drawing.order, kind, id),
      };
    }
    case "restack-item": {
      const order = restackItemLayer(
        drawing.order,
        change.kind,
        change.id,
        change.to
      );
      return order === drawing.order ? drawing : { ...drawing, order };
    }
    case "set-background":
      return change.color === drawing.background
        ? drawing
        : { ...drawing, background: change.color };
    case "clear":
      // The background stays.
      return hasContent(drawing)
        ? {
            ...drawing,
            strokes: [],
            fills: [],
            images: [],
            texts: [],
            notes: [],
            shapes: [],
            order: [],
          }
        : drawing;
    case "batch":
      return Array.isArray(change.changes)
        ? change.changes.reduce(applyChange, drawing)
        : drawing;
    // From someone else's newer version of the library, which this one
    // doesn't know how to make.
    default:
      return drawing;
  }
}
