import { type DrawingChange } from "../models/drawing-change.model";
import {
  type Drawing,
  type DrawingItem,
  type ItemKind,
} from "../models/drawing.model";
import { type Stroke } from "../models/stroke.model";
import { eraseStroke, touchesFill } from "./erase-strokes";
import {
  addItemLayer,
  addStrokeLayer,
  isEraser,
  isStrokeAtEdge,
  removeItemLayer,
  resizeStrokeLayers,
  restackItemLayer,
  restackStrokeLayer,
} from "./layers";

/** Whether anything is drawn or placed. */
export function hasContent(drawing: Drawing): boolean {
  const { strokes, fills, images, texts, notes } = drawing;
  return (
    strokes.length > 0 ||
    fills.length > 0 ||
    images.length > 0 ||
    texts.length > 0 ||
    notes.length > 0
  );
}

function getItems<K extends ItemKind>(
  drawing: Drawing,
  kind: K
): DrawingItem<K>[] {
  return drawing[kind] as DrawingItem<K>[];
}

// The drawing with an eraser drawn: the strokes it touches are cut, and it's
// kept if it erases a fill. The same drawing if it does neither.
function applyEraser(drawing: Drawing, eraser: Stroke): Drawing {
  const pieces = drawing.strokes.map((stroke) => eraseStroke(stroke, eraser));
  const cut = pieces.some(
    (each, index) => each.length !== 1 || each[0] !== drawing.strokes[index]
  );
  const kept = touchesFill(drawing.fills, eraser);
  if (!cut && !kept) {
    return drawing;
  }
  return {
    ...drawing,
    ...(cut && {
      strokes: pieces.flat(),
      order: resizeStrokeLayers(
        drawing.order,
        pieces.map((each) => each.length)
      ),
    }),
    ...(kept && { erasers: [...drawing.erasers, eraser] }),
  };
}

/**
 * The drawing once `change` is made. It's replaced rather than changed, along
 * with only the parts that change, so the canvas can tell what did. The same
 * drawing if nothing changes, e.g. clearing a blank one, or changing an item
 * someone else removed.
 */
export function applyChange(drawing: Drawing, change: DrawingChange): Drawing {
  switch (change.type) {
    case "add-stroke": {
      const { stroke } = change;
      if (isEraser(stroke)) {
        return applyEraser(drawing, stroke);
      }
      return {
        ...drawing,
        strokes: [...drawing.strokes, stroke],
        order: addStrokeLayer(drawing.order),
      };
    }
    case "update-stroke": {
      const { id, fields } = change;
      const update = (strokes: Stroke[]) =>
        strokes.map((stroke) =>
          stroke.id === id ? { ...stroke, ...fields, id } : stroke
        );
      if (drawing.strokes.some((stroke) => stroke.id === id)) {
        return { ...drawing, strokes: update(drawing.strokes) };
      }
      return drawing.erasers.some((stroke) => stroke.id === id)
        ? { ...drawing, erasers: update(drawing.erasers) }
        : drawing;
    }
    case "remove-stroke": {
      const { id } = change;
      const index = drawing.strokes.findIndex((stroke) => stroke.id === id);
      if (index >= 0) {
        return {
          ...drawing,
          strokes: drawing.strokes.filter((stroke) => stroke.id !== id),
          order: resizeStrokeLayers(
            drawing.order,
            drawing.strokes.map((_, each) => (each === index ? 0 : 1))
          ),
        };
      }
      return drawing.erasers.some((stroke) => stroke.id === id)
        ? {
            ...drawing,
            erasers: drawing.erasers.filter((stroke) => stroke.id !== id),
          }
        : drawing;
    }
    case "restack-stroke": {
      const { id, to } = change;
      const { strokes, order } = drawing;
      const index = strokes.findIndex((stroke) => stroke.id === id);
      if (index < 0 || isStrokeAtEdge(order, index, strokes.length, to)) {
        return drawing;
      }
      const others = strokes.filter((stroke) => stroke.id !== id);
      return {
        ...drawing,
        strokes:
          to === "front"
            ? [...others, strokes[index]]
            : [strokes[index], ...others],
        order: restackStrokeLayer(order, index, strokes.length, to),
      };
    }
    case "add-fill": {
      // Erasers kept after it erase it, whatever was kept before it, which
      // can differ when it's applied to someone else's drawing.
      const after = drawing.erasers.length;
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
            erasers: [],
            images: [],
            texts: [],
            notes: [],
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
