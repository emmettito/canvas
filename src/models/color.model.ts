import { type COLORS } from "../constants/colors.const";

// A color from the palette, by its CSS variable, e.g. "--canvas-color-red",
// so it follows the variable.
export type Color = (typeof COLORS)[number];

// A color picked outside the palette, as "#rrggbb", e.g. "#ff8800".
export type CustomColor = `#${string}`;

// What a tool draws in: a palette color or a custom one.
export type ToolColor = Color | CustomColor;
