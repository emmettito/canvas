import { type COLORS } from "../constants/colors.const";

// A CSS variable name from `COLORS`, e.g. "--canvas-color-red".
export type Color = (typeof COLORS)[number];
