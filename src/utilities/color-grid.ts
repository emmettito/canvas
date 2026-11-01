import { type CustomColor } from "../models/color.model";
import { parseColor, toHex } from "./colors";

// How far each row of the grid is from its column's color, top to bottom:
// towards white above it, and towards black below, with the color itself in
// between.
const TINTS = [0.92, 0.78, 0.6, 0.4, 0.2];
const SHADES = [0.2, 0.4, 0.6, 0.78];

// Colors are mixed in OKLab, where an even step looks even, so each row is
// as light as the next column's, rather than yellow's tints washing out
// first.
function toLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const channel =
    value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.min(Math.max(channel, 0), 1) * 255;
}

function toOklab([r, g, b]: number[]): number[] {
  const [red, green, blue] = [r, g, b].map(toLinear);
  const l = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  );
  const m = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  );
  const s = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([lightness, a, b]: number[]): CustomColor {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return toHex(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map(fromLinear)
  );
}

// `amount` of the way from `color` to `to`.
function mix(color: number[], to: number[], amount: number): number[] {
  return color.map((value, index) => value + (to[index] - value) * amount);
}

const WHITE = [1, 0, 0];
const BLACK = [0, 0, 0];

/**
 * A grid of colors made from `colors`, a column each, from its lightest tint
 * at the top, through the color itself, to its darkest shade, after a column
 * of grays: `white` at the top, `gray` where the colors themselves are, and
 * `black` at the bottom, with steps between. Each is "#rrggbb", as rows, top
 * first.
 */
export function getColorGrid(
  colors: string[],
  [white, gray, black]: [string, string, string]
): CustomColor[][] {
  const rows = TINTS.length + 1 + SHADES.length;
  const middle = TINTS.length;
  const toLab = (color: string) => toOklab(parseColor(color) ?? [0, 0, 0]);
  const exact = (color: string) => toHex(parseColor(color) ?? [0, 0, 0]);
  const grays = Array.from({ length: rows }, (_, row) => {
    if (row === 0) {
      return exact(white);
    }
    if (row === middle) {
      return exact(gray);
    }
    if (row === rows - 1) {
      return exact(black);
    }
    return row < middle
      ? fromOklab(mix(toLab(white), toLab(gray), row / middle))
      : fromOklab(
          mix(toLab(gray), toLab(black), (row - middle) / (rows - 1 - middle))
        );
  });
  const columns = [
    grays,
    ...colors.map((color) => {
      const lab = toOklab(parseColor(color) ?? [0, 0, 0]);
      return [
        ...TINTS.map((amount) => fromOklab(mix(lab, WHITE, amount))),
        toHex(parseColor(color) ?? [0, 0, 0]),
        ...SHADES.map((amount) => fromOklab(mix(lab, BLACK, amount))),
      ];
    }),
  ];
  return Array.from({ length: rows }, (_, row) =>
    columns.map((column) => column[row])
  );
}
