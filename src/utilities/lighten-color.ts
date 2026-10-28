// How much of the color a note keeps. The rest is white, so dark text on it
// stays readable whatever color it's made from, even black.
const NOTE_COLOR_AMOUNT = 0.4;

// Reads a CSS color as red, green and blue, from 0 to 255. The browser's
// canvas turns any color it understands into "#rrggbb" or "rgba(...)".
function parseColor(color: string): [number, number, number] | null {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    return null;
  }
  context.fillStyle = color;
  const value = context.fillStyle;
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hex) {
    return [1, 2, 3].map((index) => parseInt(hex[index], 16)) as [
      number,
      number,
      number,
    ];
  }
  const rgb = /^rgba?\((\d+), (\d+), (\d+)/.exec(value);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

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
