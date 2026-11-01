import { type ShapeType } from "../models/shape.model";

// The key that picks the shape tool with each shape, like Figma's.
export const SHAPE_SHORTCUTS: Record<ShapeType, string> = {
  rectangle: "R",
  ellipse: "O",
  line: "L",
  arrow: "A",
};
