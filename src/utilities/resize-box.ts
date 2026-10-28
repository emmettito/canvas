import { type Box } from "../models/box.model";
import { type ResizeHandle } from "../models/resize-handle.model";
import { type Size } from "../models/size.model";

/**
 * A box once `handle` is dragged `dx` and `dy`, no smaller than `min`. Only
 * the sides the handle is on move, e.g. a corner moves two, and the sides
 * across from them stay where they were.
 */
export function resizeBox(
  box: Box,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  min: Size
): Box {
  let { x, y, width, height } = box;
  if (handle.endsWith("e")) {
    width = Math.max(min.width, box.width + dx);
  } else if (handle.endsWith("w")) {
    width = Math.max(min.width, box.width - dx);
    x = box.x + box.width - width;
  }
  if (handle.startsWith("s")) {
    height = Math.max(min.height, box.height + dy);
  } else if (handle.startsWith("n")) {
    height = Math.max(min.height, box.height - dy);
    y = box.y + box.height - height;
  }
  return { x, y, width, height };
}

/**
 * A box once its corner `handle` is dragged, keeping its shape: it follows
 * whichever way the pointer moved further, and the corner across from the
 * handle stays where it was. Neither side gets smaller than `minSide`.
 */
export function resizeBoxKeepingShape(
  box: Box,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minSide: number
): Box {
  const west = handle.endsWith("w");
  const north = handle.startsWith("n");
  const ratio = box.height / box.width;
  const fromX = box.width + (west ? -dx : dx);
  const fromY = (box.height + (north ? -dy : dy)) / ratio;
  const wanted =
    Math.abs(fromX - box.width) >= Math.abs(fromY - box.width) ? fromX : fromY;
  const width = Math.max(minSide, minSide / ratio, wanted);
  const height = width * ratio;
  return {
    x: west ? box.x + box.width - width : box.x,
    y: north ? box.y + box.height - height : box.y,
    width,
    height,
  };
}
