import { type ShapeType } from "../models/shape.model";

// How shapes are drawn, in drawing units unless they say otherwise.
export const SHAPE_LAYOUT = {
  // The smallest side a rectangle or ellipse can be resized to.
  minSize: 4,
  // An arrowhead's sides, at least this long, or this many times the line's
  // width, whichever's longer, but never more than this much of the line.
  arrowLength: 12,
  arrowScale: 4,
  arrowMaxShare: 0.5,
  // How far each side of the arrowhead turns from the line, in radians.
  arrowAngle: Math.PI / 6.5,
  // How far from a line or outline, in screen pixels, still presses it.
  hitSlop: 6,
  // The shape a new shape tool draws.
  defaultType: "rectangle" as ShapeType,
};
