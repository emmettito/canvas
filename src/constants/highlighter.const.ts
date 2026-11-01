import { type Color } from "../models/color.model";

// How much of its color the highlighter's strokes show, so what's under them
// shows through, and the color it starts with.
export const HIGHLIGHTER: { opacity: number; color: Color } = {
  opacity: 0.4,
  color: "--canvas-color-yellow",
};
