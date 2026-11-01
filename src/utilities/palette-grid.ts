import { COLORS } from "../constants/colors.const";
import { type Color, type CustomColor } from "../models/color.model";
import { getColorGrid } from "./color-grid";
import { resolveColor } from "./colors";

// The palette's grays, which make the grid's first column, white at the top
// and black at the bottom, and its colors with a hue, which make a column
// each, in order.
const GRAYS = [
  "--canvas-color-white",
  "--canvas-color-gray",
  "--canvas-color-black",
] as const;
const HUES = COLORS.filter(
  (color) => !(GRAYS as readonly Color[]).includes(color)
);

// The row of the grid a note's shade of each color is in: a light tint of
// each hue, so dark text on it stays readable, and for the grays, white, a
// light gray, and a mid gray for black.
const NOTE_ROW = 2;
const GRAY_NOTE_ROWS: Record<(typeof GRAYS)[number], number> = {
  "--canvas-color-white": 0,
  "--canvas-color-gray": NOTE_ROW,
  "--canvas-color-black": 6,
};

/**
 * The color picker's grid of the palette's colors, lighter and darker, as
 * `element`'s CSS has them (see `getColorGrid`).
 */
export function getPaletteGrid(element: Element): CustomColor[][] {
  const resolve = (color: Color) => resolveColor(element, color);
  return getColorGrid(HUES.map(resolve), [
    resolve(GRAYS[0]),
    resolve(GRAYS[1]),
    resolve(GRAYS[2]),
  ]);
}

/**
 * The shade of a palette color a sticky note in it is: one of the color
 * picker's grid, so it can be picked there too.
 */
export function getNoteShade(element: Element, color: Color): CustomColor {
  const grid = getPaletteGrid(element);
  const gray = GRAY_NOTE_ROWS[color as (typeof GRAYS)[number]];
  return gray === undefined
    ? grid[NOTE_ROW][HUES.indexOf(color) + 1]
    : grid[gray][0];
}
