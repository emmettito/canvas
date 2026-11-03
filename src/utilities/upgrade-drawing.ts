import { type Drawing } from "../models/drawing.model";
import { type Fill } from "../models/fill.model";
import { type Stroke } from "../models/stroke.model";
import { eraseStroke, touchesFill } from "./erase-strokes";
import { isEraser, resizeStrokeLayers } from "./layers";

/** Whether strokes are from before they had ids and erasers cut them. */
export function isOldInk(strokes: Stroke[]): boolean {
  return strokes.some((stroke) => !stroke.id || isEraser(stroke));
}

interface Ink {
  strokes: Stroke[];
  erasers: Stroke[];
  fills: Fill[];
  // How many strokes each of the old strokes became.
  counts: number[];
}

/**
 * Strokes from before they had ids, and erasers were strokes that hid what
 * was under them, as they are now: each eraser, in turn, cuts the strokes
 * before it, and is only kept if it erases a fill. Ids come from where each
 * stroke was, so everyone upgrading the same strokes gets the same ones.
 */
export function upgradeInk(old: Stroke[], oldFills: Fill[]): Ink {
  // Each old stroke's pieces so far, by where it was.
  const pieces: Stroke[][] = [];
  const erasers: Stroke[] = [];
  // How many erasers were kept before each old stroke.
  const kept: number[] = [];
  old.forEach((stroke, index) => {
    kept.push(erasers.length);
    const id = stroke.id || `s${index}`;
    if (!isEraser(stroke)) {
      pieces.push([{ ...stroke, id }]);
      return;
    }
    pieces.push([]);
    for (let before = 0; before < index; before++) {
      pieces[before] = pieces[before].flatMap((each) =>
        eraseStroke(each, stroke)
      );
    }
    const earlier = oldFills.filter((fill) => fill.after <= index);
    if (touchesFill(earlier, stroke)) {
      erasers.push({ ...stroke, id });
    }
  });
  kept.push(erasers.length);
  return {
    strokes: pieces.flat(),
    erasers,
    fills: oldFills.map((fill) => ({
      ...fill,
      after: kept[Math.min(fill.after, old.length)],
    })),
    counts: pieces.map((each) => each.length),
  };
}

/** A drawing as it's kept now, or the same one if it already is. */
export function upgradeDrawing(drawing: Drawing): Drawing {
  const old = drawing as Omit<Drawing, "erasers"> & { erasers?: Stroke[] };
  if (old.erasers && !isOldInk(drawing.strokes)) {
    return drawing;
  }
  if (!isOldInk(drawing.strokes)) {
    return { ...drawing, erasers: [] };
  }
  const { strokes, erasers, fills, counts } = upgradeInk(
    drawing.strokes,
    drawing.fills
  );
  return {
    ...drawing,
    strokes,
    erasers,
    fills,
    order: resizeStrokeLayers(drawing.order, counts),
  };
}
