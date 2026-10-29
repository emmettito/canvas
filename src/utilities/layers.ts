import { ITEM_KINDS } from "../constants/item-kinds.const";
import {
  type Drawing,
  type DrawingItem,
  type ItemKind,
} from "../models/drawing.model";
import { type Layer } from "../models/layer.model";
import { type Stroke } from "../models/stroke.model";

/** A layer of the drawing, with what's in it. */
export type ResolvedLayer =
  | {
      kind: "strokes";
      // Where the run's first stroke is in the drawing's strokes.
      start: number;
      strokes: Stroke[];
      // Where every eraser stroke above the run is, in the drawing's strokes.
      // They erase it too, since an eraser erases every stroke before it.
      erasedBy: number[];
    }
  | { [K in ItemKind]: { kind: K; item: DrawingItem<K> } }[ItemKind];

/** Where something is moved to in the stacking order. */
export type Restack = "front" | "back";

export function isEraser(stroke: Stroke): boolean {
  return stroke.color === undefined;
}

// Runs of strokes side by side become one, e.g. once the item between them
// is removed, and empty runs are dropped.
function mergeRuns(order: Layer[]): Layer[] {
  const merged: Layer[] = [];
  for (const layer of order) {
    const last = merged.at(-1);
    if (layer.kind !== "strokes") {
      merged.push(layer);
    } else if (layer.count === 0) {
      continue;
    } else if (last?.kind === "strokes") {
      merged[merged.length - 1] = {
        kind: "strokes",
        count: last.count + layer.count,
      };
    } else {
      merged.push(layer);
    }
  }
  return merged;
}

/**
 * The order of a drawing saved before it had one: every stroke, then images,
 * text and notes, each in the order they were added.
 */
export function getDefaultOrder(
  drawing: Pick<Drawing, "strokes" | ItemKind>
): Layer[] {
  return mergeRuns([
    { kind: "strokes", count: drawing.strokes.length },
    ...ITEM_KINDS.flatMap((kind) =>
      drawing[kind].map(({ id }) => ({ kind, id }))
    ),
  ]);
}

/**
 * Whether `order` stacks exactly what's in `drawing`: each of its strokes
 * once, in turn, and each of its items once.
 */
export function isOrderOf(
  order: Layer[],
  drawing: Pick<Drawing, "strokes" | ItemKind>
): boolean {
  let strokes = 0;
  const seen = new Set<string>();
  for (const layer of order) {
    if (layer.kind === "strokes") {
      strokes += layer.count;
      continue;
    }
    const key = `${layer.kind}:${layer.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
  }
  const items = ITEM_KINDS.flatMap((kind) =>
    drawing[kind].map(({ id }) => `${kind}:${id}`)
  );
  return (
    strokes === drawing.strokes.length &&
    items.length === seen.size &&
    items.every((key) => seen.has(key))
  );
}

/** The order once a stroke is drawn, on top of everything. */
export function addStrokeLayer(order: Layer[]): Layer[] {
  return mergeRuns([...order, { kind: "strokes", count: 1 }]);
}

/** The order once an item is added, on top of everything. */
export function addItemLayer(
  order: Layer[],
  kind: ItemKind,
  id: string
): Layer[] {
  return [...order, { kind, id }];
}

function isItem(layer: Layer, kind: ItemKind, id: string): boolean {
  return layer.kind === kind && layer.id === id;
}

/** The order once an item is removed. */
export function removeItemLayer(
  order: Layer[],
  kind: ItemKind,
  id: string
): Layer[] {
  return mergeRuns(order.filter((layer) => !isItem(layer, kind, id)));
}

/**
 * The order with an item moved to the front, above everything, or the back,
 * below everything. The same order if it's already there.
 */
export function restackItemLayer(
  order: Layer[],
  kind: ItemKind,
  id: string,
  to: Restack
): Layer[] {
  const index = order.findIndex((layer) => isItem(layer, kind, id));
  if (index === -1 || index === (to === "front" ? order.length - 1 : 0)) {
    return order;
  }
  const layer = order[index];
  const rest = order.filter((_, other) => other !== index);
  return mergeRuns(to === "front" ? [...rest, layer] : [layer, ...rest]);
}

/** Whether an item is already at the front, or the back. */
export function isAtEdge(
  order: Layer[],
  kind: ItemKind,
  id: string,
  edge: Restack
): boolean {
  const layer = edge === "front" ? order.at(-1) : order[0];
  return layer !== undefined && isItem(layer, kind, id);
}

/**
 * The drawing's layers, bottom to top, with what's in each. An item the
 * drawing doesn't have is left out.
 */
export function resolveLayers(drawing: Drawing): ResolvedLayer[] {
  const items = new Map<string, ResolvedLayer>();
  for (const kind of ITEM_KINDS) {
    for (const item of drawing[kind]) {
      items.set(`${kind}:${item.id}`, { kind, item } as ResolvedLayer);
    }
  }
  const erasers = drawing.strokes.flatMap((stroke, index) =>
    isEraser(stroke) ? [index] : []
  );
  const layers: ResolvedLayer[] = [];
  let start = 0;
  for (const layer of drawing.order) {
    if (layer.kind !== "strokes") {
      const found = items.get(`${layer.kind}:${layer.id}`);
      if (found) {
        layers.push(found);
      }
      continue;
    }
    const end = start + layer.count;
    layers.push({
      kind: "strokes",
      start,
      strokes: drawing.strokes.slice(start, end),
      erasedBy: erasers.filter((index) => index >= end),
    });
    start = end;
  }
  return layers;
}
