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

/** The color's value, read from `element`'s CSS if it's the palette's. */
export function resolveColor(element: Element, color: ToolColor): string {
  return isCustomColor(color) ? color : getCssVariable(element, color);
}

/** What the color's called, e.g. "red", or "#ff8800" for a custom one. */
export function getColorName(color: ToolColor): string {
  return isCustomColor(color) ? color : color.replace("--canvas-color-", "");
}

/**
 * Reads a CSS color as red, green and blue, from 0 to 255. The browser's
 * canvas turns any color it understands into "#rrggbb" or "rgba(...)". Null
 * if it can't, e.g. without a canvas.
 */
export function parseColor(color: string): [number, number, number] | null {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
    return hex
      ? [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)]
      : null;
  }
  context.fillStyle = color;
  const value = context.fillStyle;
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hex) {
    return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
  }
  const rgb = /^rgba?\((\d+), (\d+), (\d+)/.exec(value);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
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
