import { parseColor } from "./colors";

// How much of the color a note keeps. The rest is white, so dark text on it
// stays readable whatever color it's made from, even black.
const NOTE_COLOR_AMOUNT = 0.4;

/**
 * A light shade of `color` for a sticky note, as "#rrggbb". The color is kept
 * as it is if the browser can't read it.
 */
export function getNoteColor(color: string): string {
  const channels = parseColor(color);
  if (!channels) {
    return color;
  }
  return `#${channels
    .map((channel) =>
      Math.round(channel * NOTE_COLOR_AMOUNT + 255 * (1 - NOTE_COLOR_AMOUNT))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}
