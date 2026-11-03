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
    }
  | { [K in ItemKind]: { kind: K; item: DrawingItem<K> } }[ItemKind];

/** Where something is moved to in the stacking order. */
export type Restack = "front" | "back";

export function isEraser(stroke: Stroke): boolean {
  return stroke.color === undefined;
}

/**
 * Runs of strokes side by side become one, e.g. once the item between them
 * is removed, and empty runs are dropped.
 */
export function mergeRuns(order: Layer[]): Layer[] {
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
/**
 * `order` with each stroke, by where it is in the drawing's strokes, replaced
 * by as many as `counts` says, e.g. none once it's removed, or the pieces
 * it's cut into.
 */
export function resizeStrokeLayers(order: Layer[], counts: number[]): Layer[] {
  let next = 0;
  const resized = order.flatMap<Layer>((layer) => {
    if (layer.kind !== "strokes") {
      return [layer];
    }
    const count = counts
      .slice(next, next + layer.count)
      .reduce((total, each) => total + each, 0);
    next += layer.count;
    return count > 0 ? [{ kind: "strokes", count }] : [];
  });
  return mergeRuns(resized);
}

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
    });
    start = end;
  }
  return layers;
}

/** Whether the stroke at `index` of `count` can't go any further towards `to`. */
export function isStrokeAtEdge(
  order: Layer[],
  index: number,
  count: number,
  to: Restack
): boolean {
  return to === "front"
    ? index === count - 1 && order.at(-1)?.kind === "strokes"
    : index === 0 && order[0]?.kind === "strokes";
}

/** `order` once the stroke at `index` of `count` is moved to the front or back. */
export function restackStrokeLayer(
  order: Layer[],
  index: number,
  count: number,
  to: Restack
): Layer[] {
  const counts = Array.from({ length: count }, (_, each) =>
    each === index ? 0 : 1
  );
  const without = resizeStrokeLayers(order, counts);
  return to === "front"
    ? addStrokeLayer(without)
    : mergeRuns([{ kind: "strokes", count: 1 }, ...without]);
}
