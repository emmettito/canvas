import { COLORS } from "../constants/colors.const";
import { MAX_RECENT_COLORS } from "../constants/recent-colors.const";
import {
  type Color,
  type CustomColor,
  type ToolColor,
} from "../models/color.model";
import { getCssVariable } from "./get-css-variable";

export function isCustomColor(value: unknown): value is CustomColor {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function isToolColor(value: unknown): value is ToolColor {
  return COLORS.includes(value as Color) || isCustomColor(value);
}

/**
 * The color's value, read from `element`'s CSS if it's the palette's. That's
 * kept as "#rrggbb", however the stylesheet writes it, e.g. "red" for
 * "#ff0000" once it's minified, so what's drawn and exported doesn't depend
 * on it.
 */
export function resolveColor(element: Element, color: ToolColor): string {
  if (isCustomColor(color)) {
    return color;
  }
  const value = getCssVariable(element, color);
  return readCssColor(value) ?? value;
}

/** What the color's called, e.g. "red", or "#ff8800" for a custom one. */
export function getColorName(color: ToolColor): string {
  return isCustomColor(color) ? color : color.replace("--canvas-color-", "");
}

// Reads colors for `normalizeColor`, made the first time it's needed.
let colorContext: CanvasRenderingContext2D | null | undefined;

// The browser's reading of a CSS color, as "#rrggbb" or "rgba(...)", or null
// if it isn't one. The canvas keeps its last fill for anything that isn't a
// color, so the color is set over two different fills, and only a color
// gives the same result from both.
function normalizeColor(color: string): string | null {
  colorContext ??= document.createElement("canvas").getContext("2d");
  const context = colorContext;
  if (!context) {
    return null;
  }
  context.fillStyle = "#000000";
  context.fillStyle = color;
  const fromBlack = context.fillStyle;
  context.fillStyle = "#ffffff";
  context.fillStyle = color;
  return context.fillStyle === fromBlack ? fromBlack : null;
}

// Red, green, blue and alpha, from "#rrggbb" or "rgba(...)".
function readChannels(value: string): number[] | null {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hex) {
    return [
      parseInt(hex[1], 16),
      parseInt(hex[2], 16),
      parseInt(hex[3], 16),
      1,
    ];
  }
  const rgb = /^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/.exec(value);
  return rgb
    ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)]
    : null;
}

/**
 * Reads a CSS color as red, green and blue, from 0 to 255. Null if it isn't
 * one. Without a canvas to read it with, only "#rrggbb" can be read.
 */
export function parseColor(color: string): [number, number, number] | null {
  const channels = readChannels(normalizeColor(color) ?? color);
  return channels ? [channels[0], channels[1], channels[2]] : null;
}

/**
 * Any solid CSS color, e.g. "red", "#f80", "hsl(30 100% 50%)", or hex without
 * its "#", as "#rrggbb". Null if it isn't a color, or can be seen through,
 * e.g. "transparent", which a stroke or background can't be.
 */
export function readCssColor(text: string): CustomColor | null {
  const value = text.trim();
  const color = /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : value;
  // Keywords that are colors only in CSS, e.g. "inherit", aren't.
  if (!color || /^(inherit|initial|unset|revert|currentcolor)$/i.test(color)) {
    return null;
  }
  const channels = readChannels(normalizeColor(color) ?? color);
  if (!channels || channels[3] < 1) {
    return null;
  }
  return toHex(channels);
}

/** Red, green and blue as "#rrggbb". */
export function toHex(channels: readonly number[]): CustomColor {
  return `#${channels
    .slice(0, 3)
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Whether a color is dark, so what's on it should be light. A color that
 * can't be read counts as light.
 */
export function isDarkColor(color: string): boolean {
  const channels = parseColor(color);
  if (!channels) {
    return false;
  }
  // How bright it looks, as WCAG measures it.
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18;
}

/** Puts `color` first in the recent colors, without repeating it. */
export function addRecentColor(
  recent: CustomColor[],
  color: CustomColor
): CustomColor[] {
  const lower = color.toLowerCase() as CustomColor;
  return [lower, ...recent.filter((other) => other !== lower)].slice(
    0,
    MAX_RECENT_COLORS
  );
}
