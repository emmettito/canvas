import { type COLORS } from "../constants/colors.const";

// A color from the demo's palette, by its CSS variable, e.g.
// "--canvas-color-red", so it follows the variable.
export type Color = (typeof COLORS)[number];
