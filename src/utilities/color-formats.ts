import { type CustomColor } from "../models/color.model";
import { readColorWithAlpha, splitAlpha, toHex, withAlpha } from "./colors";

/** How a color is written for someone to read or type, like Figma's. */
export type ColorFormat = "hex" | "rgb" | "css" | "hsl" | "hsb";

export const COLOR_FORMATS: { value: ColorFormat; label: string }[] = [
  { value: "hex", label: "Hex" },
  { value: "rgb", label: "RGB" },
  { value: "css", label: "CSS" },
  { value: "hsl", label: "HSL" },
  { value: "hsb", label: "HSB" },
];

export function isColorFormat(value: unknown): value is ColorFormat {
  return COLOR_FORMATS.some((format) => format.value === value);
}

/**
 * What a color format is kept for, each on its own: the tools with a color,
 * and text's formatting.
 */
export type ColorFormatTarget =
  | "pencil"
  | "highlighter"
  | "bucket"
  | "note"
  | "text";

export type ColorFormats = Record<ColorFormatTarget, ColorFormat>;

export const DEFAULT_COLOR_FORMATS: ColorFormats = {
  pencil: "hex",
  highlighter: "hex",
  bucket: "hex",
  note: "hex",
  text: "hex",
};

// Red, green and blue, from 0 to 255.
function toChannels(color: string): number[] {
  const hex = splitAlpha(color).solid;
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

// Hue in degrees, and the rest from 0 to 1.
function toHsl([r, g, b]: number[]): number[] {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  const saturation =
    chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
  return [getHue(red, green, blue, max, chroma), saturation, lightness];
}

function toHsb([r, g, b]: number[]): number[] {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const chroma = max - Math.min(red, green, blue);
  return [
    getHue(red, green, blue, max, chroma),
    max === 0 ? 0 : chroma / max,
    max,
  ];
}

function getHue(
  red: number,
  green: number,
  blue: number,
  max: number,
  chroma: number
): number {
  if (chroma === 0) {
    return 0;
  }
  const hue =
    max === red
      ? (green - blue) / chroma
      : max === green
        ? (blue - red) / chroma + 2
        : (red - green) / chroma + 4;
  return (hue * 60 + 360) % 360;
}

// Red, green and blue from a hue, a chroma, and what's added to each.
function fromHue(hue: number, chroma: number, add: number): number[] {
  const sector = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  return [r, g, b].map((channel) => (channel + add) * 255);
}

function fromHsl(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  return fromHue(hue, chroma, lightness - chroma / 2);
}

function fromHsb(hue: number, saturation: number, brightness: number) {
  const chroma = brightness * saturation;
  return fromHue(hue, chroma, brightness - chroma);
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const degrees = (value: number) => `${Math.round(value)}°`;

/**
 * `color`, "#rrggbb" or "#rrggbbaa", written in `format`, e.g. "#F27637",
 * "242, 118, 55" or "20°, 88%, 58%". Only CSS has room for how see-through it
 * is. The rest leave that to be shown beside them.
 */
export function formatColor(color: CustomColor, format: ColorFormat): string {
  const channels = toChannels(color);
  switch (format) {
    case "hex":
      return splitAlpha(color).solid.toUpperCase();
    case "rgb":
      return channels.join(", ");
    case "css": {
      const { alpha } = splitAlpha(color);
      return alpha < 1
        ? `rgba(${channels.join(", ")}, ${Math.round(alpha * 100) / 100})`
        : `rgb(${channels.join(", ")})`;
    }
    case "hsl": {
      const [hue, saturation, lightness] = toHsl(channels);
      return `${degrees(hue)}, ${percent(saturation)}, ${percent(lightness)}`;
    }
    case "hsb": {
      const [hue, saturation, brightness] = toHsb(channels);
      return `${degrees(hue)}, ${percent(saturation)}, ${percent(brightness)}`;
    }
  }
}

// The numbers in `text`, e.g. "20°, 88%, 58%", if there are `count`.
function readNumbers(text: string, count: number): number[] | null {
  const numbers = text.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  return numbers.length === count ? numbers : null;
}

const fraction = (value: number) => Math.min(Math.max(value, 0), 100) / 100;

/**
 * A color typed in `format`, as "#rrggbb", or with CSS, which can say how
 * see-through it is, "#rrggbbaa". Hex takes a CSS name too, e.g. "orange".
 * Null if it can't be read.
 */
export function readColor(
  text: string,
  format: ColorFormat
): CustomColor | null {
  switch (format) {
    case "hex": {
      const color = readColorWithAlpha(
        text.trim().replace(/^([0-9a-f]{3,8})$/i, "#$1")
      );
      return color && (color.slice(0, 7) as CustomColor);
    }
    case "css":
      return readColorWithAlpha(text);
    case "rgb": {
      const numbers = readNumbers(text, 3);
      return (
        numbers && toHex(numbers.map((n) => Math.min(Math.max(n, 0), 255)))
      );
    }
    case "hsl":
    case "hsb": {
      const numbers = readNumbers(text, 3);
      if (!numbers) {
        return null;
      }
      const [hue, saturation, last] = numbers;
      const channels =
        format === "hsl"
          ? fromHsl(hue, fraction(saturation), fraction(last))
          : fromHsb(hue, fraction(saturation), fraction(last));
      return toHex(channels);
    }
  }
}

/** `color` with the alpha of `from`, e.g. once a solid color's typed. */
export function keepAlpha(color: CustomColor, from: string): CustomColor {
  return withAlpha(color, splitAlpha(from).alpha);
}
